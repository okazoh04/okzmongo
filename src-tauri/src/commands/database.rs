use crate::state::AppState;
use bson::{Bson, Document};
use futures_util::TryStreamExt;
use mongodb::options::FindOptions;
use serde_json::Value;
use tauri::State;

fn get_client(state: &AppState, connection_id: &str) -> Result<mongodb::Client, String> {
    state
        .active_clients
        .lock()
        .unwrap()
        .get(connection_id)
        .cloned()
        .ok_or_else(|| format!("接続 '{connection_id}' が見つかりません"))
}

fn bson_to_json(bson: Bson) -> Value {
    match bson {
        Bson::ObjectId(oid) => Value::String(oid.to_hex()),
        Bson::DateTime(dt) => Value::String(dt.to_string()),
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

fn doc_to_json(doc: Document) -> Value {
    bson_to_json(Bson::Document(doc))
}

fn json_to_doc(value: Value) -> Result<Document, String> {
    match value {
        Value::Object(map) => {
            let mut doc = Document::new();
            for (k, v) in map {
                doc.insert(k, json_to_bson(v)?);
            }
            Ok(doc)
        }
        _ => Err("オブジェクト形式のJSONが必要です".to_string()),
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
            let mut doc = Document::new();
            for (k, v) in map {
                doc.insert(k, json_to_bson(v)?);
            }
            Ok(Bson::Document(doc))
        }
    }
}

#[tauri::command]
pub async fn list_databases(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<String>, String> {
    let client = get_client(&state, &connection_id)?;
    client
        .list_database_names()
        .await
        .map_err(|e| format!("DBリスト取得失敗: {e}"))
}

#[tauri::command]
pub async fn list_collections(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
) -> Result<Vec<String>, String> {
    let client = get_client(&state, &connection_id)?;
    client
        .database(&db_name)
        .list_collection_names()
        .await
        .map_err(|e| format!("コレクションリスト取得失敗: {e}"))
}

#[tauri::command]
pub async fn find_documents(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
    collection_name: String,
    filter_json: String,
    skip: u64,
    limit: i64,
) -> Result<Vec<Value>, String> {
    let client = get_client(&state, &connection_id)?;
    let col = client.database(&db_name).collection::<Document>(&collection_name);

    let filter: Document = if filter_json.trim().is_empty() || filter_json.trim() == "{}" {
        Document::new()
    } else {
        let v: Value = serde_json::from_str(&filter_json)
            .map_err(|e| format!("フィルタJSONパース失敗: {e}"))?;
        json_to_doc(v)?
    };

    let options = FindOptions::builder().skip(skip).limit(limit).build();
    let mut cursor = col
        .find(filter)
        .with_options(options)
        .await
        .map_err(|e| format!("find失敗: {e}"))?;

    let mut results = Vec::new();
    while let Some(doc) = cursor
        .try_next()
        .await
        .map_err(|e| format!("カーソル読み込み失敗: {e}"))?
    {
        results.push(doc_to_json(doc));
    }
    Ok(results)
}

#[tauri::command]
pub async fn count_documents(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
    collection_name: String,
    filter_json: String,
) -> Result<u64, String> {
    let client = get_client(&state, &connection_id)?;
    let col = client.database(&db_name).collection::<Document>(&collection_name);

    let filter: Document = if filter_json.trim().is_empty() || filter_json.trim() == "{}" {
        Document::new()
    } else {
        let v: Value = serde_json::from_str(&filter_json)
            .map_err(|e| format!("フィルタJSONパース失敗: {e}"))?;
        json_to_doc(v)?
    };

    col.count_documents(filter)
        .await
        .map_err(|e| format!("カウント失敗: {e}"))
}

#[tauri::command]
pub async fn insert_document(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
    collection_name: String,
    doc_json: String,
) -> Result<String, String> {
    let client = get_client(&state, &connection_id)?;
    let col = client.database(&db_name).collection::<Document>(&collection_name);

    let v: Value = serde_json::from_str(&doc_json)
        .map_err(|e| format!("JSONパース失敗: {e}"))?;
    let doc = json_to_doc(v)?;

    let result = col
        .insert_one(doc)
        .await
        .map_err(|e| format!("挿入失敗: {e}"))?;
    Ok(result.inserted_id.to_string())
}

#[tauri::command]
pub async fn update_document(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
    collection_name: String,
    id: String,
    doc_json: String,
) -> Result<(), String> {
    let client = get_client(&state, &connection_id)?;
    let col = client.database(&db_name).collection::<Document>(&collection_name);

    let oid = bson::oid::ObjectId::parse_str(&id)
        .map_err(|e| format!("ObjectId変換失敗: {e}"))?;
    let filter = bson::doc! { "_id": oid };

    let v: Value = serde_json::from_str(&doc_json)
        .map_err(|e| format!("JSONパース失敗: {e}"))?;
    let mut doc = json_to_doc(v)?;
    doc.remove("_id");

    col.update_one(filter, bson::doc! { "$set": doc })
        .await
        .map_err(|e| format!("更新失敗: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn delete_document(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
    collection_name: String,
    id: String,
) -> Result<(), String> {
    let client = get_client(&state, &connection_id)?;
    let col = client.database(&db_name).collection::<Document>(&collection_name);

    let oid = bson::oid::ObjectId::parse_str(&id)
        .map_err(|e| format!("ObjectId変換失敗: {e}"))?;
    col.delete_one(bson::doc! { "_id": oid })
        .await
        .map_err(|e| format!("削除失敗: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn drop_collection(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
    collection_name: String,
) -> Result<(), String> {
    let client = get_client(&state, &connection_id)?;
    client
        .database(&db_name)
        .collection::<Document>(&collection_name)
        .drop()
        .await
        .map_err(|e| format!("コレクション削除失敗: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn create_collection(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
    collection_name: String,
) -> Result<(), String> {
    let client = get_client(&state, &connection_id)?;
    client
        .database(&db_name)
        .create_collection(&collection_name)
        .await
        .map_err(|e| format!("コレクション作成失敗: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn run_aggregate(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
    collection_name: String,
    pipeline_json: String,
) -> Result<Vec<Value>, String> {
    let client = get_client(&state, &connection_id)?;
    let col = client.database(&db_name).collection::<Document>(&collection_name);

    let arr: Vec<Value> = serde_json::from_str(&pipeline_json)
        .map_err(|e| format!("パイプラインパース失敗: {e}"))?;
    let pipeline: Vec<Document> = arr.into_iter().map(json_to_doc).collect::<Result<_, _>>()?;

    let mut cursor = col
        .aggregate(pipeline)
        .await
        .map_err(|e| format!("aggregate失敗: {e}"))?;

    let mut results = Vec::new();
    while let Some(doc) = cursor
        .try_next()
        .await
        .map_err(|e| format!("カーソル読み込み失敗: {e}"))?
    {
        results.push(doc_to_json(doc));
    }
    Ok(results)
}

#[tauri::command]
pub async fn get_field_names(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
    collection_name: String,
) -> Result<Vec<String>, String> {
    let client = get_client(&state, &connection_id)?;
    let col = client.database(&db_name).collection::<Document>(&collection_name);

    let options = FindOptions::builder().limit(100).build();
    let mut cursor = col
        .find(Document::new())
        .with_options(options)
        .await
        .map_err(|e| format!("サンプル取得失敗: {e}"))?;

    let mut fields = std::collections::HashSet::new();
    while let Some(doc) = cursor
        .try_next()
        .await
        .map_err(|e| format!("カーソル読み込み失敗: {e}"))?
    {
        for key in doc.keys() {
            fields.insert(key.clone());
        }
    }

    let mut field_list: Vec<String> = fields.into_iter().collect();
    field_list.sort();
    Ok(field_list)
}

#[tauri::command]
pub async fn delete_one_by_filter(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
    collection_name: String,
    filter_json: String,
) -> Result<u64, String> {
    let client = get_client(&state, &connection_id)?;
    let col = client.database(&db_name).collection::<Document>(&collection_name);

    let v: Value = serde_json::from_str(&filter_json)
        .map_err(|e| format!("フィルタJSONパース失敗: {e}"))?;
    let filter = json_to_doc(v)?;

    let result = col
        .delete_one(filter)
        .await
        .map_err(|e| format!("削除失敗: {e}"))?;
    Ok(result.deleted_count)
}

#[tauri::command]
pub async fn update_one_by_filter(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
    collection_name: String,
    filter_json: String,
    update_json: String,
) -> Result<u64, String> {
    let client = get_client(&state, &connection_id)?;
    let col = client.database(&db_name).collection::<Document>(&collection_name);

    let fv: Value = serde_json::from_str(&filter_json)
        .map_err(|e| format!("フィルタJSONパース失敗: {e}"))?;
    let filter = json_to_doc(fv)?;

    let uv: Value = serde_json::from_str(&update_json)
        .map_err(|e| format!("更新JSONパース失敗: {e}"))?;
    let update = json_to_doc(uv)?;

    let result = col
        .update_one(filter, update)
        .await
        .map_err(|e| format!("更新失敗: {e}"))?;
    Ok(result.modified_count)
}
