use std::net::SocketAddr;
use tauri::Emitter;
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};

/// 接続失敗の原因を段階(stage)と分類(category)に分けて表現する構造化エラー。
/// フロント側で `stage`/`category` を i18n メッセージにマッピングし、`detail` は
/// 元のエラー全文として折りたたみ表示する。
#[derive(Clone, Debug, serde::Serialize)]
pub struct ConnectError {
    pub stage: &'static str,
    pub category: &'static str,
    pub detail: String,
}

impl ConnectError {
    pub fn new(stage: &'static str, category: &'static str, detail: impl Into<String>) -> Self {
        Self { stage, category, detail: detail.into() }
    }
}

/// 接続処理の進捗をフロントへ通知する。`token` は `connect`/`test_connection` の
/// 呼び出し元がステップ表示を紐付けるために渡す識別子（接続ID or 一時トークン）。
pub fn emit_progress(app: &tauri::AppHandle, token: &str, stage: &str, status: &str) {
    let _ = app.emit(
        "connect-progress",
        serde_json::json!({ "token": token, "stage": stage, "status": status }),
    );
}

async fn resolve_addrs(host: &str, port: u16) -> std::io::Result<Vec<SocketAddr>> {
    Ok(tokio::net::lookup_host((host, port)).await?.collect())
}

/// 名前解決で得られた全アドレス（IPv4/IPv6等）へ並行に接続を試み、最初に確立できたものを返す。
/// 単一アドレスへ順に試す実装（`TcpStream::connect((host, port))` に代表される標準の挙動）だと、
/// 到達不能な経路（例: ルーティングされていないIPv6）で長時間ブロックし、他の到達可能な
/// アドレスを試す前にタイムアウトしてしまう問題があるため、`select_ok` で競争させる。
async fn race_connect(addrs: &[SocketAddr]) -> std::io::Result<TcpStream> {
    use futures_util::future::select_ok;
    let futs = addrs.iter().map(|&addr| Box::pin(TcpStream::connect(addr)));
    select_ok(futs).await.map(|(stream, _rest)| stream)
}

fn classify_io_error(stage: &'static str, host: &str, port: u16, e: &std::io::Error) -> ConnectError {
    let category = match e.kind() {
        std::io::ErrorKind::ConnectionRefused => "refused",
        std::io::ErrorKind::TimedOut => "timeout",
        _ => "unreachable",
    };
    ConnectError::new(stage, category, format!("{host}:{port} — {e}"))
}

/// 指定ホスト・ポートへTCP接続を確立する（名前解決で得た全アドレスへ並行接続を試みる）。
/// SSHホストへの接続、および直接MongoDB接続時の到達性チェックの両方で使う。
pub async fn connect_tcp(
    host: &str,
    port: u16,
    budget: Duration,
    stage: &'static str,
) -> Result<TcpStream, ConnectError> {
    let attempt = async {
        let addrs = resolve_addrs(host, port)
            .await
            .map_err(|e| classify_io_error(stage, host, port, &e))?;
        race_connect(&addrs).await.map_err(|e| classify_io_error(stage, host, port, &e))
    };

    match timeout(budget, attempt).await {
        Ok(result) => result,
        Err(_) => Err(ConnectError::new(
            stage,
            "timeout",
            format!("{host}:{port} への接続がタイムアウトしました（{}秒）", budget.as_secs()),
        )),
    }
}

/// TCP到達性チェック。MongoDB driverによるサーバー選択・認証より前に行い、
/// 「ホスト/ポートに到達できない」段階と「認証・TLS等で失敗する」段階を切り分ける。
pub async fn check_tcp_reachable(host: &str, port: u16) -> Result<(), ConnectError> {
    connect_tcp(host, port, Duration::from_secs(5), "tcp").await.map(|_| ())
}

/// mongodb driver のエラーを段階別に分類する。
pub fn classify_mongo_error(err: &mongodb::error::Error) -> ConnectError {
    use mongodb::error::ErrorKind;

    let category = match &*err.kind {
        ErrorKind::Authentication { .. } => "auth_failed",
        ErrorKind::ServerSelection { .. } => "server_selection",
        ErrorKind::InvalidTlsConfig { .. } => "tls_config",
        ErrorKind::DnsResolve { .. } => "dns_fail",
        ErrorKind::Io(io_err) => match io_err.kind() {
            std::io::ErrorKind::ConnectionRefused => "refused",
            std::io::ErrorKind::TimedOut => "timeout",
            _ => "io_error",
        },
        ErrorKind::Command(cmd) => {
            if cmd.code == 18 || cmd.code_name == "AuthenticationFailed" {
                "auth_failed"
            } else if cmd.code == 13 || cmd.code_name == "Unauthorized" {
                "unauthorized"
            } else {
                "command_error"
            }
        }
        _ => "unknown",
    };

    ConnectError::new("mongo", category, err.to_string())
}
