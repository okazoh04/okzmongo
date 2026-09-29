use crate::commands::bson_json::{
    doc_to_ext_json as doc_to_json, ext_json_to_doc as json_to_doc, raw_doc_to_document,
};
use crate::state::AppState;
use bson::{Document, RawDocumentBuf};
use futures_util::TryStreamExt;
use mongodb::options::FindOptions;
use serde_json::Value;
use crate::query_log::{json_or, Recorder};
use tauri::{AppHandle, State};

fn get_client(state: &AppState, connection_id: &str) -> Result<mongodb::Client, String> {
    state
        .active_clients
        .lock()
        .unwrap()
        .get(connection_id)
        .cloned()
        .ok_or_else(|| format!("接続 '{connection_id}' が見つかりません"))
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
    app: AppHandle,
) -> Result<Vec<Value>, String> {
    let rec = Recorder::start(&app, &connection_id, &db_name, &collection_name, format!("db.{collection_name}.find({}).skip({skip}).limit({limit})", json_or(&filter_json, "{}")));
    let res: Result<Vec<Value>, String> = async {
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
        let raw_col = col.clone_with_type::<RawDocumentBuf>();
        let mut cursor = raw_col
            .find(filter)
            .with_options(options)
            .await
            .map_err(|e| format!("find失敗: {e}"))?;

        let mut results = Vec::new();
        while let Some(raw_doc) = cursor
            .try_next()
            .await
            .map_err(|e| format!("カーソル読み込み失敗: {e}"))?
        {
            results.push(doc_to_json(raw_doc_to_document(raw_doc)?));
        }
        Ok(results)
    }
    .await;
    rec.finish(res, |r| format!("docs: {}", r.len()))
}

#[tauri::command]
pub async fn count_documents(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
    collection_name: String,
    filter_json: String,
    app: AppHandle,
) -> Result<u64, String> {
    let rec = Recorder::start(&app, &connection_id, &db_name, &collection_name, format!("db.{collection_name}.countDocuments({})", json_or(&filter_json, "{}")));
    let res: Result<u64, String> = async {
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
    .await;
    rec.finish(res, |n| format!("count: {n}"))
}

#[tauri::command]
pub async fn insert_document(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
    collection_name: String,
    doc_json: String,
    app: AppHandle,
) -> Result<String, String> {
    let rec = Recorder::start(&app, &connection_id, &db_name, &collection_name, format!("db.{collection_name}.insertOne({doc_json})"));
    let res: Result<String, String> = async {
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
    .await;
    rec.finish(res, |id| format!("inserted: {id}"))
}

#[tauri::command]
pub async fn update_document(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
    collection_name: String,
    id: String,
    doc_json: String,
    app: AppHandle,
) -> Result<(), String> {
    let rec = Recorder::start(&app, &connection_id, &db_name, &collection_name, format!("db.{collection_name}.updateOne({{\"_id\": {{\"$oid\": \"{id}\"}}}}, {{\"$set\": {doc_json}}})"));
    let res: Result<(), String> = async {
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
    .await;
    rec.finish(res, |_| "ok".to_string())
}

#[tauri::command]
pub async fn delete_document(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
    collection_name: String,
    id: String,
    app: AppHandle,
) -> Result<(), String> {
    let rec = Recorder::start(&app, &connection_id, &db_name, &collection_name, format!("db.{collection_name}.deleteOne({{\"_id\": {{\"$oid\": \"{id}\"}}}})"));
    let res: Result<(), String> = async {
        let client = get_client(&state, &connection_id)?;
        let col = client.database(&db_name).collection::<Document>(&collection_name);

        let oid = bson::oid::ObjectId::parse_str(&id)
            .map_err(|e| format!("ObjectId変換失敗: {e}"))?;
        col.delete_one(bson::doc! { "_id": oid })
            .await
            .map_err(|e| format!("削除失敗: {e}"))?;
        Ok(())
    }
    .await;
    rec.finish(res, |_| "ok".to_string())
}

#[tauri::command]
pub async fn drop_collection(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
    collection_name: String,
    app: AppHandle,
) -> Result<(), String> {
    let rec = Recorder::start(&app, &connection_id, &db_name, &collection_name, format!("db.{collection_name}.drop()"));
    let res: Result<(), String> = async {
        let client = get_client(&state, &connection_id)?;
        client
            .database(&db_name)
            .collection::<Document>(&collection_name)
            .drop()
            .await
            .map_err(|e| format!("コレクション削除失敗: {e}"))?;
        Ok(())
    }
    .await;
    rec.finish(res, |_| "ok".to_string())
}

#[tauri::command]
pub async fn create_collection(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
    collection_name: String,
    app: AppHandle,
) -> Result<(), String> {
    let rec = Recorder::start(&app, &connection_id, &db_name, &collection_name, format!("db.createCollection({collection_name:?})"));
    let res: Result<(), String> = async {
        let client = get_client(&state, &connection_id)?;
        client
            .database(&db_name)
            .create_collection(&collection_name)
            .await
            .map_err(|e| format!("コレクション作成失敗: {e}"))?;
        Ok(())
    }
    .await;
    rec.finish(res, |_| "ok".to_string())
}

#[tauri::command]
pub async fn run_aggregate(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
    collection_name: String,
    pipeline_json: String,
    app: AppHandle,
) -> Result<Vec<Value>, String> {
    let rec = Recorder::start(&app, &connection_id, &db_name, &collection_name, format!("db.{collection_name}.aggregate({pipeline_json})"));
    let res: Result<Vec<Value>, String> = async {
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
    .await;
    rec.finish(res, |r| format!("docs: {}", r.len()))
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
    let raw_col = col.clone_with_type::<RawDocumentBuf>();
    let mut cursor = raw_col
        .find(Document::new())
        .with_options(options)
        .await
        .map_err(|e| format!("サンプル取得失敗: {e}"))?;

    let mut fields = std::collections::HashSet::new();
    while let Some(raw_doc) = cursor
        .try_next()
        .await
        .map_err(|e| format!("カーソル読み込み失敗: {e}"))?
    {
        let doc = raw_doc_to_document(raw_doc)?;
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
    app: AppHandle,
) -> Result<u64, String> {
    let rec = Recorder::start(&app, &connection_id, &db_name, &collection_name, format!("db.{collection_name}.deleteOne({filter_json})"));
    let res: Result<u64, String> = async {
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
    .await;
    rec.finish(res, |n| format!("deleted: {n}"))
}

#[tauri::command]
pub async fn update_one_by_filter(
    state: State<'_, AppState>,
    connection_id: String,
    db_name: String,
    collection_name: String,
    filter_json: String,
    update_json: String,
    app: AppHandle,
) -> Result<u64, String> {
    let rec = Recorder::start(&app, &connection_id, &db_name, &collection_name, format!("db.{collection_name}.updateOne({filter_json}, {update_json})"));
    let res: Result<u64, String> = async {
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
    .await;
    rec.finish(res, |n| format!("modified: {n}"))
}
