//! MongoDB へ実際に投げたクエリを `query-log` イベントでフロントへ通知する。
use serde::Serialize;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

/// 1エントリあたりのクエリ文字列の上限（巨大ドキュメントの insert 等でUIを重くしない）
const MAX_QUERY_CHARS: usize = 10_000;

#[derive(Clone, Serialize)]
pub struct QueryLog {
    /// UNIX epoch ミリ秒（実行開始時刻）
    pub ts: u64,
    pub connection_id: String,
    pub db: String,
    /// コレクション名（DB 単位の操作では空）
    pub collection: String,
    /// mongosh 風の表記。引数は実際に送った Extended JSON
    pub query: String,
    pub duration_ms: u64,
    pub ok: bool,
    /// 成功時は件数など、失敗時はエラー文
    pub detail: String,
}

fn truncate(s: String) -> String {
    if s.chars().count() <= MAX_QUERY_CHARS {
        return s;
    }
    let mut t: String = s.chars().take(MAX_QUERY_CHARS).collect();
    t.push('…');
    t
}

/// 実行時間計測と結果通知をまとめたガード。`finish` で送信する。
pub struct Recorder {
    app: AppHandle,
    connection_id: String,
    db: String,
    collection: String,
    query: String,
    ts: u64,
    started: Instant,
}

impl Recorder {
    pub fn start(
        app: &AppHandle,
        connection_id: &str,
        db: &str,
        collection: &str,
        query: String,
    ) -> Self {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        Self {
            app: app.clone(),
            connection_id: connection_id.to_string(),
            db: db.to_string(),
            collection: collection.to_string(),
            query: truncate(query),
            ts,
            started: Instant::now(),
        }
    }

    /// 結果を記録してそのまま返す。`summary` は成功時の詳細（件数など）を作る
    pub fn finish<T>(self, result: Result<T, String>, summary: impl FnOnce(&T) -> String) -> Result<T, String> {
        let (ok, detail) = match &result {
            Ok(v) => (true, summary(v)),
            Err(e) => (false, e.clone()),
        };
        let entry = QueryLog {
            ts: self.ts,
            connection_id: self.connection_id,
            db: self.db,
            collection: self.collection,
            query: self.query,
            duration_ms: self.started.elapsed().as_millis() as u64,
            ok,
            detail,
        };
        // 通知の失敗でクエリ結果を変えない
        let _ = self.app.emit("query-log", entry);
        result
    }
}

/// 空文字なら fallback を返す（フィルタ未指定の表示用）
pub fn json_or<'a>(s: &'a str, fallback: &'a str) -> &'a str {
    let t = s.trim();
    if t.is_empty() { fallback } else { t }
}
