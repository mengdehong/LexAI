use std::{error::Error, fs, path::Path};

use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    ConnectOptions, Row, SqlitePool,
};
use tauri::{Manager, State};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tokio::{fs as tokio_fs, sync::oneshot};

#[derive(Clone)]
struct AppState {
    pool: SqlitePool,
}

#[derive(Debug, Serialize)]
struct Term {
    id: i64,
    term: String,
    definition: String,
}

#[derive(Debug, Deserialize)]
struct SearchResultPayload {
    chunk_text: String,
    #[allow(dead_code)]
    score: f32,
}

#[derive(Debug, Deserialize)]
struct SearchResponsePayload {
    results: Vec<SearchResultPayload>,
}

fn escape_csv_cell(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len() + 2);
    escaped.push('"');
    for ch in value.chars() {
        if ch == '"' {
            escaped.push('"');
            escaped.push('"');
        } else {
            escaped.push(ch);
        }
    }
    escaped.push('"');
    escaped
}

#[tauri::command]
async fn fetch_backend_status() -> Result<String, String> {
    let client = Client::new();
    let response = client
        .get("http://127.0.0.1:8000/")
        .send()
        .await
        .map_err(|err| err.to_string())?;

    response.text().await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn search_term_contexts(doc_id: String, term: String) -> Result<Vec<String>, String> {
    let client = Client::new();
    let url = format!("http://127.0.0.1:8000/documents/{doc_id}/search");
    let response = client
        .get(url)
        .query(&[("term", term)])
        .send()
        .await
        .map_err(|err| err.to_string())?;

    if !response.status().is_success() {
        let detail = response
            .text()
            .await
            .unwrap_or_else(|_| "Failed to fetch contexts".to_string());
        return Err(detail);
    }

    let payload: SearchResponsePayload = response.json().await.map_err(|err| err.to_string())?;
    Ok(payload
        .results
        .into_iter()
        .map(|entry| entry.chunk_text)
        .collect())
}

#[tauri::command]
async fn add_term(
    term: String,
    definition: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    sqlx::query("INSERT INTO terms (term, definition) VALUES (?, ?)")
        .bind(term)
        .bind(definition)
        .execute(&state.pool)
        .await
        .map_err(|err| err.to_string())?;

    Ok(())
}

#[tauri::command]
async fn get_all_terms(state: State<'_, AppState>) -> Result<Vec<Term>, String> {
    let records = sqlx::query("SELECT id, term, COALESCE(definition, '') AS definition FROM terms ORDER BY created_at DESC")
        .fetch_all(&state.pool)
        .await
        .map_err(|err| err.to_string())?;

    let terms = records
        .into_iter()
        .map(|row| Term {
            id: row.get("id"),
            term: row.get("term"),
            definition: row.get("definition"),
        })
        .collect();

    Ok(terms)
}

#[tauri::command]
async fn find_term_by_name(
    term: String,
    state: State<'_, AppState>,
) -> Result<Option<Term>, String> {
    let record = sqlx::query(
        "SELECT id, term, COALESCE(definition, '') AS definition FROM terms WHERE lower(term) = lower(?) LIMIT 1",
    )
    .bind(&term)
    .fetch_optional(&state.pool)
    .await
    .map_err(|err| err.to_string())?;

    let result = record.map(|row| Term {
        id: row.get("id"),
        term: row.get("term"),
        definition: row.get("definition"),
    });

    Ok(result)
}

#[tauri::command]
async fn delete_term(id: i64, state: State<'_, AppState>) -> Result<(), String> {
    sqlx::query("DELETE FROM terms WHERE id = ?")
        .bind(id)
        .execute(&state.pool)
        .await
        .map_err(|err| err.to_string())?;

    Ok(())
}

#[tauri::command]
async fn update_term(
    id: i64,
    term: String,
    definition: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    sqlx::query("UPDATE terms SET term = ?, definition = ? WHERE id = ?")
        .bind(term)
        .bind(definition)
        .bind(id)
        .execute(&state.pool)
        .await
        .map_err(|err| err.to_string())?;

    Ok(())
}

#[tauri::command]
async fn export_terms_csv(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let records = sqlx::query(
        "SELECT term, COALESCE(definition, '') AS definition FROM terms ORDER BY lower(term) ASC",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|err| err.to_string())?;

    if records.is_empty() {
        return Err("No terms available to export.".to_string());
    }

    let mut csv = String::from("Term,Definition\n");
    for row in records {
        let term: String = row.get("term");
        let definition: String = row.get("definition");
        let line = format!(
            "{},{}\n",
            escape_csv_cell(&term),
            escape_csv_cell(&definition)
        );
        csv.push_str(&line);
    }

    let (sender, receiver) = oneshot::channel::<Option<FilePath>>();

    let mut builder = app_handle
        .dialog()
        .file()
        .set_title("Export terminology")
        .set_file_name("lexai_terms.csv")
        .add_filter("CSV", &["csv"]);

    if let Some(window) = app_handle.get_webview_window("main") {
        builder = builder.set_parent(&window);
    }

    builder.save_file(move |path| {
        let _ = sender.send(path.map(FilePath::simplified));
    });

    let selected = receiver
        .await
        .map_err(|_| "Failed to capture selected export path.".to_string())?;

    let Some(file_path) = selected else {
        return Err("Export cancelled.".to_string());
    };

    let path = file_path.into_path().map_err(|err| err.to_string())?;

    tokio_fs::write(path, csv)
        .await
        .map_err(|err| err.to_string())?;

    Ok(())
}

async fn init_database(db_path: &Path) -> Result<SqlitePool, sqlx::Error> {
    let connect_options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .disable_statement_logging();

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(connect_options)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|err| -> Box<dyn Error> { Box::new(err) })?;

            fs::create_dir_all(&data_dir).map_err(|err| -> Box<dyn Error> { Box::new(err) })?;

            let db_path = data_dir.join("lexai.db");

            let pool = tauri::async_runtime::block_on(init_database(&db_path))
                .map_err(|err| -> Box<dyn Error> { Box::new(err) })?;
            app.manage(AppState { pool });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_backend_status,
            search_term_contexts,
            add_term,
            get_all_terms,
            find_term_by_name,
            delete_term,
            update_term,
            export_terms_csv
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
