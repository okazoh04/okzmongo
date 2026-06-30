use crate::crypto::{decrypt_opt, encrypt_opt, load_or_create_key};
use crate::ssh_tunnel;
use crate::state::{AppState, AuthConfig, ConnectionConfig, TlsConfig};
use mongodb::options::{ClientOptions, Credential, Tls, TlsOptions};
use std::path::PathBuf;
use tauri::{Manager, State};
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

    if direct {
        options.direct_connection = Some(true);
    }

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
    if let Some(tunnel) = state.ssh_tunnels.lock().unwrap().remove(&id) {
        tunnel.shutdown();
    }
    Ok(())
}

#[tauri::command]
pub async fn connect(state: State<'_, AppState>, id: String) -> Result<(), String> {
    // 既存のトンネルがあれば先に閉じる
    if let Some(old) = state.ssh_tunnels.lock().unwrap().remove(&id) {
        old.shutdown();
    }

    let config = {
        let conns = state.connections.lock().unwrap();
        conns.iter().find(|c| c.id == id).cloned()
            .ok_or_else(|| "接続設定が見つかりません".to_string())?
    };

    let ssh_active = config.ssh.as_ref().is_some_and(|s| s.enabled);
    let (mongo_host, mongo_port) = if ssh_active {
        let ssh = config.ssh.as_ref().unwrap();
        let tunnel = ssh_tunnel::start_tunnel(
            &ssh.host,
            ssh.port,
            &ssh.username,
            ssh.password.as_deref(),
            ssh.key_file.as_deref(),
            &config.host,
            config.port,
        )
        .await?;
        let local_port = tunnel.local_port;
        state.ssh_tunnels.lock().unwrap().insert(id.clone(), tunnel);
        ("127.0.0.1".to_string(), local_port)
    } else {
        (config.host.clone(), config.port)
    };

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
    if let Some(tunnel) = state.ssh_tunnels.lock().unwrap().remove(&id) {
        tunnel.shutdown();
    }
    Ok(())
}

#[tauri::command]
pub async fn list_connected_ids(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(state.connected_ids())
}

#[tauri::command]
pub async fn test_connection(config: ConnectionConfig) -> Result<(), String> {
    let ssh_active = config.ssh.as_ref().is_some_and(|s| s.enabled);

    let (mongo_host, mongo_port, tunnel) = if ssh_active {
        let ssh = config.ssh.as_ref().unwrap();
        let tunnel = ssh_tunnel::start_tunnel(
            &ssh.host,
            ssh.port,
            &ssh.username,
            ssh.password.as_deref(),
            ssh.key_file.as_deref(),
            &config.host,
            config.port,
        )
        .await?;
        let port = tunnel.local_port;
        ("127.0.0.1".to_string(), port, Some(tunnel))
    } else {
        (config.host.clone(), config.port, None)
    };

    let options = build_client_options(&mongo_host, mongo_port, &config.auth, &config.tls, ssh_active).await?;
    let client = mongodb::Client::with_options(options)
        .map_err(|e| format!("クライアント生成失敗: {e}"))?;

    let result = client
        .database("admin")
        .run_command(bson::doc! { "ping": 1 })
        .await
        .map_err(|e| format!("MongoDB に接続できません: {e}"));

    if let Some(t) = tunnel {
        t.shutdown();
    }

    result.map(|_| ())
}
