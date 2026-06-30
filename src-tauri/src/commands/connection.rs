use crate::crypto::{decrypt_opt, encrypt_opt, load_or_create_key};
use crate::state::{AppState, AuthConfig, ConnectionConfig, SshConfig, TlsConfig};
use mongodb::options::{ClientOptions, Credential, Tls, TlsOptions};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use tauri::{Manager, State};
use tokio::time::{sleep, Duration};
use uuid::Uuid;

// ---- 永続化（パスワードフィールドを AES-256-GCM で暗号化） ----

fn connections_path(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir()
        .expect("app_data_dir 取得失敗")
        .join("connections.json")
}

fn encrypt_passwords(key: &[u8; 32], mut c: ConnectionConfig) -> ConnectionConfig {
    if let Some(a) = &mut c.auth {
        a.password = crate::crypto::encrypt(key, &a.password);
    }
    if let Some(s) = &mut c.ssh {
        s.password = encrypt_opt(key, &s.password);
    }
    c
}

fn decrypt_passwords(key: &[u8; 32], mut c: ConnectionConfig) -> ConnectionConfig {
    if let Some(a) = &mut c.auth {
        if let Some(plain) = crate::crypto::decrypt(key, &a.password) {
            a.password = plain;
        }
        // 平文フォールバック: enc: prefix がなければそのまま
    }
    if let Some(s) = &mut c.ssh {
        s.password = decrypt_opt(key, &s.password).or(s.password.clone());
    }
    c
}

pub fn load_connections(app: &tauri::AppHandle, key: &[u8; 32]) -> Vec<ConnectionConfig> {
    let path = connections_path(app);
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<Vec<ConnectionConfig>>(&s).ok())
        .unwrap_or_default()
        .into_iter()
        .map(|c| decrypt_passwords(key, c))
        .collect()
}

pub fn init_key(app: &tauri::AppHandle) -> [u8; 32] {
    load_or_create_key(app)
}

fn save_connections(app: &tauri::AppHandle, key: &[u8; 32], connections: &[ConnectionConfig]) -> Result<(), String> {
    let path = connections_path(app);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("ディレクトリ作成失敗: {e}"))?;
    }
    let encrypted: Vec<_> = connections.iter()
        .cloned()
        .map(|c| encrypt_passwords(key, c))
        .collect();
    let json = serde_json::to_string_pretty(&encrypted)
        .map_err(|e| format!("JSON変換失敗: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("ファイル書込失敗: {e}"))?;
    Ok(())
}

// ---- SSH トンネル ----

fn free_port() -> Result<u16, String> {
    let l = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("空きポート取得失敗: {e}"))?;
    Ok(l.local_addr().unwrap().port())
}

fn start_tunnel(ssh: &SshConfig, mongo_host: &str, mongo_port: u16) -> Result<(Child, u16), String> {
    let local_port = free_port()?;
    let forward = format!("{local_port}:{mongo_host}:{mongo_port}");

    let child = if ssh.password.as_deref().is_some_and(|p| !p.is_empty()) {
        // パスワード認証: sshpass を使用
        let pass = ssh.password.as_deref().unwrap();
        let mut cmd = Command::new("sshpass");
        cmd.args(["-p", pass, "ssh"]);
        add_ssh_args(&mut cmd, ssh, &forward);
        cmd.spawn().map_err(|e| format!("sshpass起動失敗 (sshpassがインストールされていない可能性): {e}"))?
    } else {
        let mut cmd = Command::new("ssh");
        if let Some(key) = &ssh.key_file {
            if !key.is_empty() {
                cmd.args(["-i", key]);
            }
        }
        add_ssh_args(&mut cmd, ssh, &forward);
        cmd.spawn().map_err(|e| format!("SSH起動失敗: {e}"))?
    };

    Ok((child, local_port))
}

fn add_ssh_args(cmd: &mut Command, ssh: &SshConfig, forward: &str) {
    cmd.args([
        "-N",
        "-L", forward,
        "-p", &ssh.port.to_string(),
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "ServerAliveInterval=30",
        "-o", "ExitOnForwardFailure=yes",
        &format!("{}@{}", ssh.username, ssh.host),
    ]);
    cmd.stdout(Stdio::null()).stderr(Stdio::null());
}

async fn wait_for_port(port: u16, timeout_ms: u64) -> bool {
    let deadline = std::time::Instant::now() + Duration::from_millis(timeout_ms);
    while std::time::Instant::now() < deadline {
        if TcpListener::bind(format!("127.0.0.1:{port}")).is_err() {
            // ポートが使われている = トンネルが開いた
            return true;
        }
        sleep(Duration::from_millis(200)).await;
    }
    false
}

// ---- ClientOptions ビルド ----

async fn build_client_options(
    host: &str,
    port: u16,
    auth: &Option<AuthConfig>,
    tls: &Option<TlsConfig>,
    direct: bool,
) -> Result<ClientOptions, String> {
    let uri = format!("mongodb://{host}:{port}");
    let mut options = ClientOptions::parse(&uri)
        .await
        .map_err(|e| format!("URIパース失敗: {e}"))?;

    // SSH トンネル経由の ReplicaSet 対策：advertised hostname へのフォローを無効化
    if direct {
        options.direct_connection = Some(true);
    }

    // 認証
    if let Some(a) = auth {
        if !a.username.is_empty() {
            options.credential = Some(
                Credential::builder()
                    .username(a.username.clone())
                    .password(a.password.clone())
                    .source(if a.auth_db.is_empty() { "admin".to_string() } else { a.auth_db.clone() })
                    .build(),
            );
        }
    }

    // TLS
    if let Some(t) = tls {
        if t.enabled {
            let mut tls_opts = TlsOptions::default();
            tls_opts.ca_file_path = t.ca_file.as_deref().filter(|s| !s.is_empty()).map(PathBuf::from);
            tls_opts.cert_key_file_path = t.cert_key_file.as_deref().filter(|s| !s.is_empty()).map(PathBuf::from);
            if t.allow_invalid_certs {
                tls_opts.allow_invalid_certificates = Some(true);
            }
            options.tls = Some(Tls::Enabled(tls_opts));
        }
    }

    Ok(options)
}

// ---- Tauri コマンド ----

#[tauri::command]
pub async fn list_connections(state: State<'_, AppState>) -> Result<Vec<ConnectionConfig>, String> {
    Ok(state.connections.lock().unwrap().clone())
}

#[tauri::command]
pub async fn add_connection(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    config: ConnectionConfig,
) -> Result<ConnectionConfig, String> {
    let mut c = config;
    c.id = Uuid::new_v4().to_string();
    let mut conns = state.connections.lock().unwrap();
    conns.push(c.clone());
    save_connections(&app, state.key(), &conns)?;
    Ok(c)
}

#[tauri::command]
pub async fn update_connection(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    config: ConnectionConfig,
) -> Result<(), String> {
    let mut conns = state.connections.lock().unwrap();
    if let Some(existing) = conns.iter_mut().find(|c| c.id == config.id) {
        *existing = config;
    }
    save_connections(&app, state.key(), &conns)?;
    Ok(())
}

#[tauri::command]
pub async fn remove_connection(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    {
        let mut conns = state.connections.lock().unwrap();
        conns.retain(|c| c.id != id);
        save_connections(&app, state.key(), &conns)?;
    }
    state.active_clients.lock().unwrap().remove(&id);
    kill_ssh(&state, &id);
    Ok(())
}

fn kill_ssh(state: &AppState, id: &str) {
    if let Some(pid) = state.ssh_pids.lock().unwrap().remove(id) {
        let _ = Command::new("kill").arg(pid.to_string()).status();
    }
}

#[tauri::command]
pub async fn connect(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let config = {
        let conns = state.connections.lock().unwrap();
        conns.iter().find(|c| c.id == id).cloned()
            .ok_or_else(|| "接続設定が見つかりません".to_string())?
    };

    // SSH トンネル
    let ssh_active = config.ssh.as_ref().is_some_and(|s| s.enabled);
    let (mongo_host, mongo_port) = if ssh_active {
        let ssh = config.ssh.as_ref().unwrap();
        let (child, local_port) = start_tunnel(ssh, &config.host, config.port)?;
        let pid = child.id();

        // バックグラウンドで管理（drop しないよう leak）
        std::mem::forget(child);

        // トンネルが開くまで待つ（最大5秒）
        if !wait_for_port(local_port, 5000).await {
            return Err("SSHトンネルの確立がタイムアウトしました".to_string());
        }

        state.ssh_pids.lock().unwrap().insert(id.clone(), pid);
        ("127.0.0.1".to_string(), local_port)
    } else {
        (config.host.clone(), config.port)
    };

    // SSH 経由の場合は directConnection=true で ReplicaSet advertised hostname への
    // フォローを防ぐ（トンネル先ホスト名がローカルから解決できないため）
    let options = build_client_options(&mongo_host, mongo_port, &config.auth, &config.tls, ssh_active).await?;
    let client = mongodb::Client::with_options(options)
        .map_err(|e| format!("クライアント生成失敗: {e}"))?;

    client
        .database("admin")
        .run_command(bson::doc! { "ping": 1 })
        .await
        .map_err(|e| format!("MongoDB に接続できません: {e}"))?;

    state.active_clients.lock().unwrap().insert(id.clone(), client);
    Ok(())
}

#[tauri::command]
pub async fn disconnect(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.active_clients.lock().unwrap().remove(&id);
    kill_ssh(&state, &id);
    Ok(())
}

#[tauri::command]
pub async fn list_connected_ids(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(state.connected_ids())
}
