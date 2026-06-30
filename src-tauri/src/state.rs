use mongodb::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AuthConfig {
    pub username: String,
    pub password: String,
    pub auth_db: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TlsConfig {
    pub enabled: bool,
    pub ca_file: Option<String>,
    pub cert_key_file: Option<String>,
    pub allow_invalid_certs: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SshConfig {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    pub key_file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionConfig {
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub auth: Option<AuthConfig>,
    pub tls: Option<TlsConfig>,
    pub ssh: Option<SshConfig>,
}

pub struct AppState {
    pub connections: Mutex<Vec<ConnectionConfig>>,
    /// 接続済みクライアント (接続ID -> Client)
    pub active_clients: Mutex<HashMap<String, Client>>,
    /// SSH トンネルプロセス (接続ID -> PID)
    pub ssh_pids: Mutex<HashMap<String, u32>>,
    /// AES-256-GCM 暗号化鍵（起動時に一度だけ設定）
    pub crypto_key: OnceLock<[u8; 32]>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            connections: Mutex::new(Vec::new()),
            active_clients: Mutex::new(HashMap::new()),
            ssh_pids: Mutex::new(HashMap::new()),
            crypto_key: OnceLock::new(),
        }
    }

    pub fn key(&self) -> &[u8; 32] {
        self.crypto_key.get().expect("crypto_key 未初期化")
    }

    pub fn is_connected(&self, id: &str) -> bool {
        self.active_clients.lock().unwrap().contains_key(id)
    }

    pub fn connected_ids(&self) -> Vec<String> {
        self.active_clients.lock().unwrap().keys().cloned().collect()
    }
}
