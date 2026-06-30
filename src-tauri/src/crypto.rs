use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};

const PREFIX: &str = "enc:";

pub fn load_or_create_key(app: &tauri::AppHandle) -> [u8; 32] {
    use tauri::Manager;
    let key_path = app.path().app_data_dir()
        .expect("app_data_dir 取得失敗")
        .join("key.bin");

    if let Ok(bytes) = std::fs::read(&key_path) {
        if bytes.len() == 32 {
            return bytes.try_into().unwrap();
        }
    }

    let key = Aes256Gcm::generate_key(OsRng);
    std::fs::create_dir_all(key_path.parent().unwrap()).ok();
    std::fs::write(&key_path, key.as_slice()).ok();
    key.into()
}

pub fn encrypt(key: &[u8; 32], plaintext: &str) -> String {
    let cipher = Aes256Gcm::new_from_slice(key).unwrap();
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let mut combined = nonce.to_vec();
    combined.extend_from_slice(
        &cipher.encrypt(&nonce, plaintext.as_bytes()).expect("暗号化失敗"),
    );
    format!("{PREFIX}{}", B64.encode(&combined))
}

pub fn decrypt(key: &[u8; 32], ciphertext: &str) -> Option<String> {
    let encoded = ciphertext.strip_prefix(PREFIX)?;
    let combined = B64.decode(encoded).ok()?;
    if combined.len() < 12 {
        return None;
    }
    let (nonce_bytes, data) = combined.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(key).ok()?;
    let nonce = Nonce::from_slice(nonce_bytes);
    let plain = cipher.decrypt(nonce, data).ok()?;
    String::from_utf8(plain).ok()
}

/// 既に暗号化済みなら再暗号化しない（None や空文字はそのまま返す）
pub fn encrypt_opt(key: &[u8; 32], value: &Option<String>) -> Option<String> {
    value.as_deref().filter(|s| !s.is_empty()).map(|s| encrypt(key, s))
}

pub fn decrypt_opt(key: &[u8; 32], value: &Option<String>) -> Option<String> {
    value.as_deref().and_then(|s| {
        if s.starts_with(PREFIX) {
            decrypt(key, s)
        } else {
            Some(s.to_string()) // 平文フォールバック（移行時）
        }
    })
}
