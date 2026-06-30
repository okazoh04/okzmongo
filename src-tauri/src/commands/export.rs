use crate::state::AppState;
use bson::{Bson, Document};
use futures_util::TryStreamExt;
use serde_json::Value;
use tauri::State;

fn bson_to_json(bson: Bson) -> Value {
    match bson {
        Bson::ObjectId(oid) => {
            serde_json::json!({ "$oid": oid.to_hex() })
        }
        Bson::DateTime(dt) => {
            serde_json::json!({ "$date": dt.timestamp_millis() })
        }
        Bson::Document(doc) => {
            let map: serde_json::Map<String, Value> =
                doc.into_iter().map(|(k, v)| (k, bson_to_json(v))).collect();
            Value::Object(map)
        }
        Bson::Array(arr) => Value::Array(arr.into_iter().map(bson_to_json).collect()),
        Bson::Boolean(b) => Value::Bool(b),
        Bson::Int32(i) => Value::Number(i.into()),
        Bson::Int64(i) => Value::Number(i.into()),
        Bson::Double(f) => serde_json::Number::from_f64(f)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        Bson::String(s) => Value::String(s),
        Bson::Null => Value::Null,
        other => Value::String(format!("{other}")),
    }
}

fn json_to_bson(value: Value) -> Result<Bson, String> {
    match value {
        Value::Null => Ok(Bson::Null),
        Value::Bool(b) => Ok(Bson::Boolean(b)),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Ok(Bson::Int64(i))
            } else if let Some(f) = n.as_f64() {
                Ok(Bson::Double(f))
            } else {
                Err(format!("数値変換失敗: {n}"))
            }
        }
        Value::String(s) => Ok(Bson::String(s)),
        Value::Array(arr) => {
            let bson_arr: Result<Vec<_>, _> = arr.into_iter().map(json_to_bson).collect();
            Ok(Bson::Array(bson_arr?))
        }
        Value::Object(map) => {
            // Extended JSON の $oid / $date を復元
            if map.len() == 1 {
                if let Some(Value::String(oid_str)) = map.get("$oid") {
                    if let Ok(oid) = bson::oid::ObjectId::parse_str(oid_str) {
                        return Ok(Bson::ObjectId(oid));
                    }
                }
                if let Some(Value::Number(ms)) = map.get("$date") {
                    if let Some(i) = ms.as_i64() {
                        return Ok(Bson::DateTime(bson::DateTime::from_millis(i)));
                    }
                }
            }
            let mut doc = Document::new();
            for (k, v) in map {
                doc.insert(k, json_to_bson(v)?);
            }
            Ok(Bson::Document(doc))
        }
    }
}

#[tauri::command]
pub async fn export_collection(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
    collection_name: String,
) -> Result<String, String> {
    let client = state
        .active_clients
        .lock()
        .unwrap()
        .get(&connection_id)
        .cloned()
        .ok_or_else(|| format!("接続 '{connection_id}' が見つかりません"))?;

    let col = client
        .database(&db_name)
        .collection::<Document>(&collection_name);

    let mut cursor = col
        .find(Document::new())
        .await
        .map_err(|e| format!("find失敗: {e}"))?;

    let mut docs = Vec::new();
    while let Some(doc) = cursor
        .try_next()
        .await
        .map_err(|e| format!("カーソル読み込み失敗: {e}"))?
    {
        docs.push(bson_to_json(Bson::Document(doc)));
    }

    serde_json::to_string_pretty(&docs).map_err(|e| format!("JSON変換失敗: {e}"))
}

#[tauri::command]
pub async fn import_collection(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
    collection_name: String,
    json_data: String,
) -> Result<u64, String> {
    let client = state
        .active_clients
        .lock()
        .unwrap()
        .get(&connection_id)
        .cloned()
        .ok_or_else(|| format!("接続 '{connection_id}' が見つかりません"))?;

    let col = client
        .database(&db_name)
        .collection::<Document>(&collection_name);

    let values: Vec<Value> = serde_json::from_str(&json_data)
        .map_err(|e| format!("JSONパース失敗: {e}"))?;

    let mut docs = Vec::new();
    for v in values {
        match json_to_bson(v)? {
            Bson::Document(doc) => docs.push(doc),
            _ => return Err("配列の各要素はオブジェクトである必要があります".to_string()),
        }
    }

    let count = docs.len() as u64;
    if !docs.is_empty() {
        col.insert_many(docs)
            .await
            .map_err(|e| format!("インポート失敗: {e}"))?;
    }
    Ok(count)
}
