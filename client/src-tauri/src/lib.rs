use std::{error::Error, fs, path::Path, sync::Arc};

use chrono::Utc;

use blake3::hash;
use genanki_rs::{basic_model, Deck, Error as AnkiError, Note};
use genpdf::{
    elements::{Break, Paragraph, StyledElement},
    fonts::{FontData, FontFamily},
    style::Effect,
    Document,
};
use reqwest::Client as HttpClient;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    ConnectOptions, Row, SqlitePool,
};
use tauri::async_runtime::spawn_blocking;
use tauri::{Manager, State};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tauri_plugin_store::StoreExt;
use tauri_plugin_stronghold::stronghold::Stronghold;
use tokio::{
    fs as tokio_fs,
    sync::{oneshot, Mutex as AsyncMutex},
};

use iota_stronghold::{Client as StrongholdClient, ClientError};

#[derive(Clone)]
struct AppState {
    pool: SqlitePool,
}

const STRONGHOLD_SNAPSHOT: &str = "stronghold.scout";
const STRONGHOLD_CLIENT_PATH: &[u8] = b"lexai_api_credentials";
const STRONGHOLD_STORE_PREFIX: &str = "provider::";

struct StrongholdInner {
    stronghold: Stronghold,
    client_path: Vec<u8>,
}

impl StrongholdInner {
    fn ensure_client(&self) -> Result<StrongholdClient, String> {
        match self.stronghold.inner().get_client(&self.client_path) {
            Ok(client) => Ok(client),
            Err(ClientError::ClientDataNotPresent) => {
                match self.stronghold.inner().load_client(&self.client_path) {
                    Ok(client) => Ok(client),
                    Err(ClientError::ClientDataNotPresent) => self
                        .stronghold
                        .inner()
                        .create_client(&self.client_path)
                        .map_err(|err| err.to_string()),
                    Err(err) => Err(err.to_string()),
                }
            }
            Err(err) => Err(err.to_string()),
        }
    }

    fn provider_key(provider: &str) -> Vec<u8> {
        format!("{STRONGHOLD_STORE_PREFIX}{provider}").into_bytes()
    }
}

struct SecretsManager {
    inner: Arc<AsyncMutex<StrongholdInner>>,
}

impl SecretsManager {
    fn new(inner: StrongholdInner) -> Self {
        Self {
            inner: Arc::new(AsyncMutex::new(inner)),
        }
    }

    async fn save_api_key(&self, provider: &str, key: &str) -> Result<(), String> {
        let guard = self.inner.lock().await;
        let client = guard.ensure_client()?;
        let record_key = StrongholdInner::provider_key(provider);
        let sanitized = key.trim();

        if sanitized.is_empty() {
            let _ = client
                .store()
                .delete(&record_key)
                .map_err(|err| err.to_string())?;
        } else {
            let _ = client
                .store()
                .insert(record_key.clone(), sanitized.as_bytes().to_vec(), None)
                .map_err(|err| err.to_string())?;
        }

        guard.stronghold.save().map_err(|err| err.to_string())
    }

    async fn get_api_key(&self, provider: &str) -> Result<Option<String>, String> {
        let guard = self.inner.lock().await;
        let client = guard.ensure_client()?;
        let record_key = StrongholdInner::provider_key(provider);

        match client
            .store()
            .get(&record_key)
            .map_err(|err| err.to_string())?
        {
            Some(bytes) => {
                let value = String::from_utf8(bytes).map_err(|err| err.to_string())?;
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    Ok(None)
                } else {
                    Ok(Some(trimmed.to_string()))
                }
            }
            None => Ok(None),
        }
    }

    async fn has_api_key(&self, provider: &str) -> Result<bool, String> {
        let guard = self.inner.lock().await;
        let client = guard.ensure_client()?;
        let record_key = StrongholdInner::provider_key(provider);

        client
            .store()
            .contains_key(&record_key)
            .map_err(|err| err.to_string())
    }
}

#[derive(Debug, Serialize, Clone)]
struct Term {
    id: i64,
    term: String,
    definition: String,
    definition_cn: Option<String>,
    review_stage: i64,
    last_reviewed_at: Option<String>,
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
    let client = HttpClient::new();
    let response = client
        .get("http://127.0.0.1:8000/")
        .send()
        .await
        .map_err(|err| err.to_string())?;

    response.text().await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn search_term_contexts(doc_id: String, term: String) -> Result<Vec<String>, String> {
    let client = HttpClient::new();
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
    definition_cn: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    sqlx::query("INSERT INTO terms (term, definition, definition_cn) VALUES (?, ?, ?)")
        .bind(term)
        .bind(definition)
        .bind(definition_cn)
        .execute(&state.pool)
        .await
        .map_err(|err| err.to_string())?;

    Ok(())
}

#[tauri::command]
async fn get_all_terms(state: State<'_, AppState>) -> Result<Vec<Term>, String> {
    let records = sqlx::query(
        "SELECT id, term, COALESCE(definition, '') AS definition, definition_cn, review_stage, last_reviewed_at FROM terms ORDER BY created_at DESC",
    )
        .fetch_all(&state.pool)
        .await
        .map_err(|err| err.to_string())?;

    let terms = records
        .into_iter()
        .map(|row| Term {
            id: row.get("id"),
            term: row.get("term"),
            definition: row.get("definition"),
            definition_cn: row.get("definition_cn"),
            review_stage: row.get("review_stage"),
            last_reviewed_at: row.get("last_reviewed_at"),
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
        "SELECT id, term, COALESCE(definition, '') AS definition, definition_cn, review_stage, last_reviewed_at FROM terms WHERE lower(term) = lower(?) LIMIT 1",
    )
    .bind(&term)
    .fetch_optional(&state.pool)
    .await
    .map_err(|err| err.to_string())?;

    let result = record.map(|row| Term {
        id: row.get("id"),
        term: row.get("term"),
        definition: row.get("definition"),
        definition_cn: row.get("definition_cn"),
        review_stage: row.get("review_stage"),
        last_reviewed_at: row.get("last_reviewed_at"),
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
    definition_cn: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    sqlx::query("UPDATE terms SET term = ?, definition = ?, definition_cn = COALESCE(?, definition_cn) WHERE id = ?")
        .bind(term)
        .bind(definition)
        .bind(definition_cn)
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
    let terms = load_terms_sorted(&state.pool).await?;
    if terms.is_empty() {
        return Err("No terms available to export.".to_string());
    }

    let csv = spawn_blocking(move || build_csv(&terms))
        .await
        .map_err(|err| err.to_string())??;

    let path = prompt_save_path(
        &app_handle,
        "lexai_terms.csv",
        "CSV",
        &["csv"],
        "Export terminology",
    )
    .await?;

    tokio_fs::write(path, csv)
        .await
        .map_err(|err| err.to_string())?;

    Ok(())
}

fn build_csv(terms: &[Term]) -> Result<String, String> {
    let mut csv = String::from("Term,Definition,Definition (zh-CN)\n");
    for entry in terms {
        let line = format!(
            "{},{},{}\n",
            escape_csv_cell(&entry.term),
            escape_csv_cell(&entry.definition),
            escape_csv_cell(entry.definition_cn.as_deref().unwrap_or(""))
        );
        csv.push_str(&line);
    }
    Ok(csv)
}

async fn prompt_save_path(
    app_handle: &tauri::AppHandle,
    default_file_name: &str,
    filter_label: &str,
    filter_extensions: &[&str],
    title: &str,
) -> Result<std::path::PathBuf, String> {
    let (sender, receiver) = oneshot::channel::<Option<FilePath>>();

    let mut builder = app_handle
        .dialog()
        .file()
        .set_title(title)
        .set_file_name(default_file_name)
        .add_filter(filter_label, filter_extensions);

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

    file_path.into_path().map_err(|err| err.to_string())
}

async fn load_terms_sorted(pool: &SqlitePool) -> Result<Vec<Term>, String> {
    let records = sqlx::query(
        "SELECT id, term, COALESCE(definition, '') AS definition, COALESCE(definition_cn, '') AS definition_cn, review_stage, last_reviewed_at FROM terms ORDER BY lower(term) ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|err| err.to_string())?;

    Ok(records
        .into_iter()
        .map(|row| Term {
            id: row.get("id"),
            term: row.get("term"),
            definition: row.get("definition"),
            definition_cn: {
                let value: String = row.get("definition_cn");
                if value.is_empty() {
                    None
                } else {
                    Some(value)
                }
            },
            review_stage: row.get("review_stage"),
            last_reviewed_at: row.get("last_reviewed_at"),
        })
        .collect())
}

#[tauri::command]
async fn export_terms_anki(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let terms = load_terms_sorted(&state.pool).await?;
    if terms.is_empty() {
        return Err("No terms available to export.".to_string());
    }

    let path = prompt_save_path(
        &app_handle,
        "lexai_terms.apkg",
        "Anki deck",
        &["apkg"],
        "Export Anki deck",
    )
    .await?;

    let deck_terms = terms.clone();
    spawn_blocking(move || build_anki_package(&path, &deck_terms))
        .await
        .map_err(|err| err.to_string())??;

    Ok(())
}

fn build_anki_package(path: &Path, terms: &[Term]) -> Result<(), String> {
    let mut deck = Deck::new(805_202_110, "LexAI Termbase", "Exported from LexAI");
    let model = basic_model();

    for term in terms {
        let definition_cn = term.definition_cn.as_deref();
        let combined = build_anki_back_field(&term.definition, definition_cn);

        let note = Note::new(model.clone(), vec![term.term.as_str(), &combined])
            .map_err(|err: AnkiError| err.to_string())?;
        deck.add_note(note);
    }

    deck.write_to_file(path.to_str().ok_or("Invalid path for Anki export")?)
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn export_terms_pdf(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let terms = load_terms_sorted(&state.pool).await?;
    if terms.is_empty() {
        return Err("No terms available to export.".to_string());
    }

    let path = prompt_save_path(
        &app_handle,
        "lexai_terms.pdf",
        "PDF",
        &["pdf"],
        "Export PDF",
    )
    .await?;

    let printable_terms = terms.clone();
    spawn_blocking(move || build_pdf(&path, &printable_terms))
        .await
        .map_err(|err| err.to_string())??;

    Ok(())
}

fn build_pdf(path: &Path, terms: &[Term]) -> Result<(), String> {
    let font_family = load_pdf_font_family()?;

    let mut doc = Document::new(font_family);
    doc.set_title("LexAI Terminology Export");
    doc.set_minimal_conformance();

    for term in terms {
        let heading = StyledElement::new(Paragraph::new(term.term.clone()), Effect::Bold);
        doc.push(heading);

        doc.push(Paragraph::new(sanitize_pdf_text(&term.definition)));

        if let Some(def_cn) = term.definition_cn.as_deref() {
            if !def_cn.is_empty() {
                doc.push(Paragraph::new(sanitize_pdf_text(def_cn)));
            }
        }

        doc.push(Break::new(1.2));
    }

    doc.render_to_file(path)
        .map_err(|err| format!("Failed to write PDF: {err}"))
}

#[tauri::command]
async fn get_review_terms(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<Term>, String> {
    let limit = limit.unwrap_or(20).clamp(1, 100);

    let records = sqlx::query(
        "SELECT id, term, COALESCE(definition, '') AS definition, definition_cn, review_stage, last_reviewed_at FROM terms ORDER BY review_stage ASC, COALESCE(last_reviewed_at, '') ASC, created_at ASC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(&state.pool)
    .await
    .map_err(|err| err.to_string())?;

    let terms = records
        .into_iter()
        .map(|row| Term {
            id: row.get("id"),
            term: row.get("term"),
            definition: row.get("definition"),
            definition_cn: row.get("definition_cn"),
            review_stage: row.get("review_stage"),
            last_reviewed_at: row.get("last_reviewed_at"),
        })
        .collect();

    Ok(terms)
}

#[tauri::command]
async fn submit_review_result(
    id: i64,
    known: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    apply_review_result(&state.pool, id, known).await
}

async fn apply_review_result(pool: &SqlitePool, id: i64, known: bool) -> Result<(), String> {
    let record = sqlx::query("SELECT review_stage FROM terms WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|err| err.to_string())?;

    let Some(row) = record else {
        return Err("Term not found".to_string());
    };

    let current_stage: i64 = row.get("review_stage");
    let next_stage = if known {
        current_stage.saturating_add(1).min(5)
    } else {
        current_stage.saturating_sub(1)
    };
    let timestamp = Utc::now().to_rfc3339();

    sqlx::query("UPDATE terms SET review_stage = ?, last_reviewed_at = ? WHERE id = ?")
        .bind(next_stage)
        .bind(timestamp)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|err| err.to_string())?;

    Ok(())
}

#[tauri::command]
async fn save_api_key(
    provider: String,
    key: String,
    manager: State<'_, SecretsManager>,
) -> Result<(), String> {
    manager.save_api_key(&provider, &key).await
}

#[tauri::command]
async fn get_api_key(
    provider: String,
    manager: State<'_, SecretsManager>,
) -> Result<Option<String>, String> {
    manager.get_api_key(&provider).await
}

#[tauri::command]
async fn has_api_key(provider: String, manager: State<'_, SecretsManager>) -> Result<bool, String> {
    manager.has_api_key(&provider).await
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

fn migrate_legacy_api_keys(
    app: &tauri::App,
    secrets_manager: &SecretsManager,
) -> Result<(), String> {
    let config_store = app
        .store("lexai-config.store")
        .map_err(|err| err.to_string())?;

    let Some(JsonValue::Array(mut providers)) = config_store.get("providers") else {
        return Ok(());
    };

    let mut changed = false;

    for provider in providers.iter_mut() {
        let Some(object) = provider.as_object_mut() else {
            continue;
        };

        let Some(provider_id) = object
            .get("id")
            .and_then(|value| value.as_str())
            .map(str::to_string)
        else {
            // remove legacy apiKey if id missing
            if object.remove("apiKey").is_some() {
                changed = true;
            }
            continue;
        };

        if let Some(api_key_value) = object.remove("apiKey") {
            changed = true;
            if let Some(api_key_str) = api_key_value
                .as_str()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                tauri::async_runtime::block_on(
                    secrets_manager.save_api_key(&provider_id, api_key_str),
                )
                .map_err(|err| err.to_string())?;
            }
        }
    }

    if changed {
        config_store.set("providers", JsonValue::Array(providers));
        config_store.save().map_err(|err| err.to_string())?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_stronghold::Builder::new(|password| {
                hash(password.as_bytes()).as_bytes().to_vec()
            })
            .build(),
        )
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|err| -> Box<dyn Error> { Box::new(err) })?;

            fs::create_dir_all(&data_dir).map_err(|err| -> Box<dyn Error> { Box::new(err) })?;

            let db_path = data_dir.join("lexai.db");
            let stronghold_path = data_dir.join(STRONGHOLD_SNAPSHOT);
            let master_key = hash(b"lexai-default-master-password");

            let stronghold = Stronghold::new(&stronghold_path, master_key.as_bytes().to_vec())
                .map_err(|err| -> Box<dyn Error> { Box::new(err) })?;

            let secrets_inner = StrongholdInner {
                stronghold,
                client_path: STRONGHOLD_CLIENT_PATH.to_vec(),
            };
            let secrets_manager = SecretsManager::new(secrets_inner);

            migrate_legacy_api_keys(app, &secrets_manager)
                .map_err(|err| -> Box<dyn Error> { Box::new(std::io::Error::other(err)) })?;

            app.manage(secrets_manager);

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
            export_terms_csv,
            export_terms_anki,
            export_terms_pdf,
            get_review_terms,
            submit_review_result,
            save_api_key,
            get_api_key,
            has_api_key
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn build_anki_back_field(definition: &str, definition_cn: Option<&str>) -> String {
    let mut content = encode_html(definition);
    content = content.replace('\n', "<br>");

    if let Some(def_cn) = definition_cn {
        if !def_cn.trim().is_empty() {
            let mut cn = encode_html(def_cn);
            cn = cn.replace('\n', "<br>");
            content.push_str("<br><div class=\"definition-cn\">");
            content.push_str(&cn);
            content.push_str("</div>");
        }
    }

    content
}

fn encode_html(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            _ => escaped.push(ch),
        }
    }
    escaped
}

fn load_pdf_font_family() -> Result<FontFamily<FontData>, String> {
    let font_bytes = include_bytes!("../resources/fonts/DejaVuSans.ttf");
    let load = |data: &[u8]| {
        FontData::new(data.to_vec(), None).map_err(|err| format!("Failed to load font: {err}"))
    };

    Ok(FontFamily {
        regular: load(font_bytes)?,
        bold: load(font_bytes)?,
        italic: load(font_bytes)?,
        bold_italic: load(font_bytes)?,
    })
}

fn sanitize_pdf_text(value: &str) -> String {
    value
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .replace('\t', "    ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Row;
    use tempfile::tempdir;

    async fn setup_pool() -> (tempfile::TempDir, SqlitePool) {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("lexai.db");
        let pool = init_database(&db_path).await.unwrap();
        (dir, pool)
    }

    #[tokio::test]
    async fn submit_review_result_updates_stage_and_timestamp() {
        let (_dir, pool) = setup_pool().await;

        sqlx::query("INSERT INTO terms (term, definition, definition_cn) VALUES (?, ?, ?)")
            .bind("Neural Network")
            .bind("An interconnected group of nodes.")
            .bind(Option::<String>::None)
            .execute(&pool)
            .await
            .unwrap();

        let row = sqlx::query("SELECT id FROM terms WHERE term = ?")
            .bind("Neural Network")
            .fetch_one(&pool)
            .await
            .unwrap();
        let id: i64 = row.get("id");

        apply_review_result(&pool, id, true).await.unwrap();
        let first = sqlx::query("SELECT review_stage, last_reviewed_at FROM terms WHERE id = ?")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
        let stage_after_known: i64 = first.get("review_stage");
        let ts_first: String = first.get("last_reviewed_at");
        assert_eq!(stage_after_known, 1);
        assert!(!ts_first.is_empty());

        apply_review_result(&pool, id, false).await.unwrap();
        let second = sqlx::query("SELECT review_stage, last_reviewed_at FROM terms WHERE id = ?")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
        let stage_after_unknown: i64 = second.get("review_stage");
        let ts_second: String = second.get("last_reviewed_at");
        assert_eq!(stage_after_unknown, 0);
        assert!(!ts_second.is_empty());
        assert!(ts_second >= ts_first);
    }

    #[tokio::test]
    async fn secrets_manager_persists_and_clears_keys() {
        let dir = tempdir().unwrap();
        let snapshot_path = dir.path().join("stronghold.scout");
        let master_key = hash(b"test-master-password");
        let stronghold = Stronghold::new(&snapshot_path, master_key.as_bytes().to_vec()).unwrap();

        let secrets = SecretsManager::new(StrongholdInner {
            stronghold,
            client_path: b"test-client".to_vec(),
        });

        assert_eq!(secrets.get_api_key("openai").await.unwrap(), None);

        secrets.save_api_key("openai", "sk-test-123").await.unwrap();
        assert!(snapshot_path.exists());
        assert_eq!(
            secrets.get_api_key("openai").await.unwrap(),
            Some("sk-test-123".to_string())
        );
        assert!(secrets.has_api_key("openai").await.unwrap());

        secrets.save_api_key("openai", "").await.unwrap();
        assert_eq!(secrets.get_api_key("openai").await.unwrap(), None);
        assert!(!secrets.has_api_key("openai").await.unwrap());
    }
}
