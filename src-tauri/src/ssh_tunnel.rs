use crate::connect_error::ConnectError;
use async_trait::async_trait;
use russh::client;
use russh::ChannelMsg;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;
use tokio::task::AbortHandle;
use tokio::time::timeout;

/// SSH接続確立・認証それぞれに適用するタイムアウト。
/// russh はTCP接続・鍵/パスワード認証の応答待ちに既定のタイムアウトを持たないため、
/// 到達不能なホストや応答のないサーバーに対して無期限に待機してしまうのを防ぐ。
const SSH_STEP_TIMEOUT: Duration = Duration::from_secs(10);

pub struct TunnelHandle {
    pub local_port: u16,
    abort_handle: AbortHandle,
}

impl TunnelHandle {
    pub fn shutdown(self) {
        self.abort_handle.abort();
    }
}

struct IgnoreHostKey;

#[async_trait]
impl client::Handler for IgnoreHostKey {
    type Error = russh::Error;
    async fn check_server_key(
        &mut self,
        _key: &russh_keys::key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

pub async fn start_tunnel(
    ssh_host: &str,
    ssh_port: u16,
    ssh_username: &str,
    auth_password: Option<&str>,
    auth_key_file: Option<&str>,
    remote_host: &str,
    remote_port: u16,
) -> Result<TunnelHandle, ConnectError> {
    // 名前解決で得た全アドレス（IPv4/IPv6等）へ並行接続し、最初に確立できたものを使う。
    // 順に試す実装だと、到達不能な経路（例: ルーティングされていないIPv6）で長時間
    // ブロックし、他の到達可能なアドレスを試す前にタイムアウトしてしまうため。
    let stream = crate::connect_error::connect_tcp(ssh_host, ssh_port, SSH_STEP_TIMEOUT, "ssh").await?;

    let config = Arc::new(client::Config::default());
    let mut handle = timeout(SSH_STEP_TIMEOUT, client::connect_stream(config, stream, IgnoreHostKey))
        .await
        .map_err(|_| ConnectError::new("ssh", "timeout", "SSHハンドシェイクがタイムアウトしました"))?
        .map_err(|e| ConnectError::new("ssh", "unreachable", format!("SSHハンドシェイク: {e}")))?;

    // 認証: 鍵ファイル → パスワード → SSH エージェント の順で試行
    let authenticated = if let Some(path) = auth_key_file.filter(|s| !s.is_empty()) {
        let expanded = expand_tilde(path);
        let key = russh_keys::load_secret_key(&expanded, None)
            .map_err(|e| ConnectError::new("ssh", "key_load", format!("{expanded}: {e}")))?;
        timeout(SSH_STEP_TIMEOUT, handle.authenticate_publickey(ssh_username, Arc::new(key)))
            .await
            .map_err(|_| ConnectError::new("ssh", "timeout", "公開鍵認証の応答がタイムアウトしました"))?
            .map_err(|e| ConnectError::new("ssh", "auth_failed", format!("公開鍵認証: {e}")))?
    } else if let Some(pw) = auth_password.filter(|s| !s.is_empty()) {
        timeout(SSH_STEP_TIMEOUT, handle.authenticate_password(ssh_username, pw))
            .await
            .map_err(|_| ConnectError::new("ssh", "timeout", "パスワード認証の応答がタイムアウトしました"))?
            .map_err(|e| ConnectError::new("ssh", "auth_failed", format!("パスワード認証: {e}")))?
    } else {
        agent_auth(&mut handle, ssh_username).await?
    };

    if !authenticated {
        return Err(ConnectError::new("ssh", "auth_failed", "認証情報を確認してください"));
    }

    // ローカルポート確保（accept ループまで Listener を保持）
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| ConnectError::new("ssh", "local_port", e.to_string()))?;
    let local_port = listener.local_addr().unwrap().port();

    let remote_host = remote_host.to_string();
    let handle = Arc::new(Mutex::new(handle));

    let join = tokio::spawn(async move {
        loop {
            let Ok((tcp, peer)) = listener.accept().await else { break };
            let h = handle.clone();
            let rh = remote_host.clone();
            tokio::spawn(async move {
                let ch = h
                    .lock()
                    .await
                    .channel_open_direct_tcpip(
                        &rh,
                        remote_port as u32,
                        &peer.ip().to_string(),
                        peer.port() as u32,
                    )
                    .await;
                if let Ok(ch) = ch {
                    proxy(tcp, ch).await;
                }
            });
        }
    });

    Ok(TunnelHandle {
        local_port,
        abort_handle: join.abort_handle(),
    })
}

/// TCP ストリームと SSH チャンネルの双方向プロキシ
async fn proxy(mut tcp: TcpStream, mut ch: russh::Channel<client::Msg>) {
    let mut buf = vec![0u8; 16384];
    loop {
        tokio::select! {
            // TCP → SSH チャンネル
            result = tcp.read(&mut buf) => {
                match result {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if ch.data(&buf[..n]).await.is_err() { break; }
                    }
                }
            }
            // SSH チャンネル → TCP
            msg = ch.wait() => {
                match msg {
                    Some(ChannelMsg::Data { ref data }) => {
                        if tcp.write_all(data).await.is_err() { break; }
                    }
                    Some(ChannelMsg::Eof) | None => break,
                    _ => {}
                }
            }
        }
    }
    let _ = ch.eof().await;
}

async fn agent_auth(
    _handle: &mut client::Handle<IgnoreHostKey>,
    _username: &str,
) -> Result<bool, ConnectError> {
    // russh 0.46 では PublicKey のみ取得でき、エージェント署名のフローが未整備のため未対応
    // 鍵ファイル（key_file）またはパスワードを指定してください
    Err(ConnectError::new(
        "ssh",
        "agent_unsupported",
        "SSHエージェント認証は現在未対応です。接続設定で鍵ファイルまたはパスワードを指定してください。",
    ))
}

fn expand_tilde(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return format!("{home}/{rest}");
        }
    }
    path.to_string()
}
