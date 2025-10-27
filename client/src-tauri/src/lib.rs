use std::{
    collections::HashMap,
    error::Error,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};

use chrono::Utc;

use blake3::hash;
use genanki_rs::{basic_model, Deck, Error as AnkiError, Note};
use genpdf::{
    elements::{Break, Paragraph, StyledElement},
    fonts::{FontData, FontFamily},
    style::Effect,
    Document,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    ConnectOptions, Row, SqlitePool,
};
use tauri::async_runtime::spawn_blocking;
use tauri::{Emitter, Manager, State, WindowEvent};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tauri_plugin_store::StoreExt;
use tauri_plugin_stronghold::stronghold::Stronghold;
use tokio::{
    fs as tokio_fs,
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStderr, ChildStdin, ChildStdout},
    sync::{oneshot, Mutex as AsyncMutex},
    time::{timeout, Duration},
};

use iota_stronghold::{Client as StrongholdClient, ClientError};

#[derive(Serialize)]
struct RpcDiagnostics {
    running: bool,
    exit_status: Option<i32>,
    stderr_tail: Option<String>,
}

struct RpcClient {
    child: Arc<AsyncMutex<Child>>,
    stdin: Arc<AsyncMutex<ChildStdin>>,
    stdout: Arc<AsyncMutex<BufReader<ChildStdout>>>,
    stderr: Option<Arc<AsyncMutex<BufReader<ChildStderr>>>>,
    stderr_buf: Arc<AsyncMutex<Vec<String>>>,
    log_file: Option<Arc<AsyncMutex<tokio_fs::File>>>,
    next_id: AtomicU64,
    response_timeout: Duration,
}

impl RpcClient {
    async fn new(
        mut child: Child,
        response_timeout: Duration,
        log_path: Option<PathBuf>,
    ) -> Result<Self, String> {
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Child process stdin unavailable".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Child process stdout unavailable".to_string())?;
        let stderr = child.stderr.take();

        let log_file = if let Some(path) = log_path {
            match tokio_fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(path)
                .await
            {
                Ok(f) => Some(Arc::new(AsyncMutex::new(f))),
                Err(_) => None,
            }
        } else {
            None
        };

        let client = Self {
            child: Arc::new(AsyncMutex::new(child)),
            stdin: Arc::new(AsyncMutex::new(stdin)),
            stdout: Arc::new(AsyncMutex::new(BufReader::new(stdout))),
            stderr: stderr.map(|s| Arc::new(AsyncMutex::new(BufReader::new(s)))),
            stderr_buf: Arc::new(AsyncMutex::new(Vec::with_capacity(64))),
            log_file,
            next_id: AtomicU64::new(1),
            response_timeout,
        };

        if let Some(stderr_reader) = &client.stderr {
            let stderr_reader = stderr_reader.clone();
            let buf = client.stderr_buf.clone();
            let log = client.log_file.clone();
            tauri::async_runtime::spawn(async move {
                let mut line = String::new();
                loop {
                    line.clear();
                    let read = {
                        let mut s = stderr_reader.lock().await;
                        s.read_line(&mut line).await
                    };
                    match read {
                        Ok(0) => break,
                        Ok(_) => {
                            let mut b = buf.lock().await;
                            b.push(line.trim_end_matches(['\r', '\n']).to_string());
                            if b.len() > 100 {
                                let overflow = b.len() - 100;
                                b.drain(0..overflow);
                            }
                            if let Some(file) = &log {
                                if let Ok(mut f) = file.try_lock() {
                                    let _ = f.write_all(line.as_bytes()).await;
                                }
                            }
                        }
                        Err(_) => break,
                    }
                }
            });
        }

        Ok(client)
    }

    async fn call(&self, method: &str, params: JsonValue) -> Result<JsonValue, String> {
        {
            let mut child = self.child.lock().await;
            if let Some(status) = child
                .try_wait()
                .map_err(|err| format!("Failed to poll child status: {err}"))?
            {
                return Err(format!(
                    "RPC worker exited unexpectedly with status {status}"
                ));
            }
        }

        let request_id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let request = json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params,
        });

        let mut payload = request.to_string();
        payload.push('\n');

        {
            let mut stdin = self.stdin.lock().await;
            stdin
                .write_all(payload.as_bytes())
                .await
                .map_err(|err| format!("Failed to write request: {err}"))?;
            stdin
                .flush()
                .await
                .map_err(|err| format!("Failed to flush request: {err}"))?;
        }

        let mut line = String::new();
        {
            let mut stdout = self.stdout.lock().await;
            timeout(self.response_timeout, stdout.read_line(&mut line))
                .await
                .map_err(|_| "Timed out waiting for RPC response".to_string())?
                .map_err(|err| format!("Failed to read response: {err}"))?;
        }

        if line.trim().is_empty() {
            return Err("Received empty response from RPC worker".to_string());
        }

        let response: JsonValue = serde_json::from_str(&line)
            .map_err(|err| format!("Failed to parse response JSON: {err}"))?;

        if let Some(error) = response.get("error") {
            return Err(error.to_string());
        }

        let result = response
            .get("result")
            .cloned()
            .ok_or_else(|| "Response missing result".to_string())?;

        Ok(result)
    }
}

impl RpcClient {
    async fn diagnostics(&self) -> RpcDiagnostics {
        let mut running = true;
        let mut exit_status = None;
        if let Ok(mut child) = self.child.try_lock() {
            if let Ok(Some(status)) = child.try_wait() {
                running = false;
                exit_status = status.code();
            }
        }
        let stderr_tail = {
            let buf = self.stderr_buf.lock().await;
            if buf.is_empty() {
                None
            } else {
                Some(buf.join("\n"))
            }
        };
        RpcDiagnostics {
            running,
            exit_status,
            stderr_tail,
        }
    }
}

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

#[derive(Debug, Serialize, Clone)]
pub struct BatchProgress {
    total: usize,
    completed: usize,
    failed: usize,
    cancelled: bool,
    per_file: HashMap<String, String>,
}

#[allow(dead_code)]
const EVT_BATCH_PROGRESS: &str = "batch://progress";

#[tauri::command]
#[allow(dead_code)]
async fn start_batch_upload(
    files: Vec<BatchFileSpec>,
    app: tauri::AppHandle,
    rpc_manager: State<'_, RpcManager>,
    batch_state: State<'_, BatchState>,
) -> Result<bool, String> {
    let client = rpc_manager.ensure_client(&app).await?;
    batch_state
        .cancel
        .store(false, std::sync::atomic::Ordering::Relaxed);
    let total = files.len();
    let per_file: Arc<AsyncMutex<HashMap<String, String>>> =
        Arc::new(AsyncMutex::new(HashMap::new()));

    let app_handle = app.clone();
    tauri::async_runtime::spawn({
        let per_file = per_file.clone();
        let cancel = batch_state.cancel.clone();
        async move {
            let mut completed = 0usize;
            let mut failed = 0usize;
            for spec in files {
                if cancel.load(std::sync::atomic::Ordering::Relaxed) {
                    let snapshot = {
                        let pf = per_file.lock().await;
                        BatchProgress {
                            total,
                            completed,
                            failed,
                            cancelled: true,
                            per_file: pf.clone(),
                        }
                    };
                    let _ = app_handle.emit(EVT_BATCH_PROGRESS, snapshot);
                    break;
                }
                let name = spec.file_name.clone();
                let result = client
                    .call(
                        "upload_document",
                        json!({"file_path": spec.file_path, "file_name": spec.file_name}),
                    )
                    .await;
                {
                    let mut pf = per_file.lock().await;
                    match result {
                        Ok(_) => {
                            pf.insert(name, "ok".into());
                            completed += 1;
                        }
                        Err(e) => {
                            pf.insert(name, format!("error: {}", e));
                            failed += 1;
                        }
                    }
                }
                // emit progress after each file
                let snapshot = {
                    let pf = per_file.lock().await;
                    BatchProgress {
                        total,
                        completed,
                        failed,
                        cancelled: false,
                        per_file: pf.clone(),
                    }
                };
                let _ = app_handle.emit(EVT_BATCH_PROGRESS, snapshot);
            }
            // final snapshot if finished naturally
            let snapshot = {
                let pf = per_file.lock().await;
                BatchProgress {
                    total,
                    completed,
                    failed,
                    cancelled: cancel.load(std::sync::atomic::Ordering::Relaxed),
                    per_file: pf.clone(),
                }
            };
            let _ = app_handle.emit(EVT_BATCH_PROGRESS, snapshot);
        }
    });

    Ok(true)
}

#[tauri::command]
#[allow(dead_code)]
async fn cancel_batch(batch_state: State<'_, BatchState>) -> Result<bool, String> {
    batch_state
        .cancel
        .store(true, std::sync::atomic::Ordering::Relaxed);
    Ok(true)
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct BatchFileSpec {
    file_path: String,
    file_name: String,
}

#[derive(Clone, Default)]
#[allow(dead_code)]
struct BatchState {
    #[allow(dead_code)]
    cancel: Arc<std::sync::atomic::AtomicBool>,
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

    async fn save_api_keys_batch(&self, providers: &[String], key: &str) -> Result<(), String> {
        let guard = self.inner.lock().await;
        let client = guard.ensure_client()?;
        let sanitized = key.trim();

        for provider in providers {
            let record_key = StrongholdInner::provider_key(provider);
            if sanitized.is_empty() {
                let _ = client
                    .store()
                    .delete(&record_key)
                    .map_err(|err| err.to_string())?;
            } else {
                let _ = client
                    .store()
                    .insert(record_key, sanitized.as_bytes().to_vec(), None)
                    .map_err(|err| err.to_string())?;
            }
        }

        // Only save once after all inserts
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

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize)]
struct UploadPayload {
    document_id: String,
    #[serde(default)]
    extracted_text: Option<String>,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    status: String,
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

#[derive(Clone, Default)]
struct RpcManager {
    client: Arc<AsyncMutex<Option<Arc<RpcClient>>>>,
}

impl RpcManager {
    fn new() -> Self {
        Self::default()
    }

    fn client_handle(&self) -> Arc<AsyncMutex<Option<Arc<RpcClient>>>> {
        self.client.clone()
    }

    async fn ensure_client(&self, app: &tauri::AppHandle) -> Result<Arc<RpcClient>, String> {
        if let Some(existing) = self.client.lock().await.as_ref() {
            return Ok(existing.clone());
        }

        let client = Arc::new(spawn_rpc_worker(app).await?);
        self.client.lock().await.replace(client.clone());
        Ok(client)
    }

    async fn shutdown_with(handle: Arc<AsyncMutex<Option<Arc<RpcClient>>>>) {
        if let Some(client) = handle.lock().await.take() {
            let _ = client.child.lock().await.kill().await;
        }
    }
}

async fn spawn_rpc_worker(app: &tauri::AppHandle) -> Result<RpcClient, String> {
    // In dev mode, check src-tauri/resources first
    let exe_name = if cfg!(windows) {
        "rpc_server.exe"
    } else {
        "rpc_server"
    };

    // Try to find the binary in multiple locations
    let mut resource_path = None;

    // 1. Development mode: src-tauri/resources/rpc_server/rpc_server.exe
    if cfg!(debug_assertions) {
        let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
        if let Some(target_dir) = current_exe.parent().and_then(|p| p.parent()) {
            // Try: target/debug/../resources/rpc_server/rpc_server.exe
            let dev_path = target_dir
                .parent()
                .map(|p| p.join("resources").join("rpc_server").join(exe_name));
            if let Some(path) = dev_path {
                if path.exists() {
                    eprintln!(
                        "[spawn_rpc_worker] Found RPC server (dev mode 1): {:?}",
                        path
                    );
                    resource_path = Some(path);
                }
            }

            // Try: target/debug/../../src-tauri/resources/rpc_server/rpc_server.exe
            if resource_path.is_none() {
                let dev_path2 = target_dir.parent().and_then(|p| p.parent()).map(|p| {
                    p.join("src-tauri")
                        .join("resources")
                        .join("rpc_server")
                        .join(exe_name)
                });
                if let Some(path) = dev_path2 {
                    if path.exists() {
                        eprintln!(
                            "[spawn_rpc_worker] Found RPC server (dev mode 2): {:?}",
                            path
                        );
                        resource_path = Some(path);
                    }
                }
            }
        }
    }

    // 2. Production mode: use BaseDirectory::Resource
    if resource_path.is_none() {
        let base_resource_path = app
            .path()
            .resolve(
                "rpc_server/rpc_server",
                tauri::path::BaseDirectory::Resource,
            )
            .map_err(|err| err.to_string())?;

        #[cfg(windows)]
        {
            let candidate = base_resource_path.with_extension("exe");
            if candidate.exists() {
                resource_path = Some(candidate);
            } else if base_resource_path.exists() {
                resource_path = Some(base_resource_path);
            } else {
                // Fallback to older packaging layout
                let alt = app
                    .path()
                    .resolve(
                        "resources/rpc_server/rpc_server.exe",
                        tauri::path::BaseDirectory::Resource,
                    )
                    .map_err(|err| err.to_string())?;
                if alt.exists() {
                    resource_path = Some(alt);
                }
            }
        }

        #[cfg(not(windows))]
        {
            if base_resource_path.exists() {
                resource_path = Some(base_resource_path);
            }
        }
    }

    let resource_path = resource_path.ok_or_else(|| {
        format!(
            "RPC worker binary not found. Searched in development and production locations for {}",
            exe_name
        )
    })?;

    let resource_dir = resource_path
        .parent()
        .ok_or_else(|| "Failed to resolve RPC resource directory".to_string())?
        .to_path_buf();

    // The _internal directory is required on Linux for bundled libs; skip strict check on other OSes
    #[cfg(target_os = "linux")]
    {
        let internal_dir = resource_dir.join("_internal");
        if !internal_dir.exists() {
            return Err(format!(
                "RPC resource internal directory missing at {}",
                internal_dir.display()
            ));
        }
    }

    let storage_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| err.to_string())?
        .join("qdrant");

    fs::create_dir_all(&storage_dir).map_err(|err| err.to_string())?;

    // logs dir
    let logs_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| err.to_string())?
        .join("logs");
    fs::create_dir_all(&logs_dir).map_err(|err| err.to_string())?;
    let log_path = logs_dir.join("rpc_server.log");

    // huggingface cache dir (avoid user home cache path issues on Windows)
    let hf_cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| err.to_string())?
        .join("hf-cache");
    fs::create_dir_all(&hf_cache_dir).map_err(|err| err.to_string())?;

    let mut command = tokio::process::Command::new(resource_path);
    command.kill_on_drop(true);
    command.stdin(std::process::Stdio::piped());
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());
    command.env("QDRANT__STORAGE", storage_dir.to_string_lossy().to_string());
    // Force UTF-8 IO and reduce noisy HF hub warnings; ensure local cache in app_data
    command.env("PYTHONIOENCODING", "utf-8");
    command.env("PYTHONUTF8", "1");
    command.env("HF_HUB_ENABLE_HF_XET", "0");
    command.env("HF_HUB_DISABLE_TELEMETRY", "1");
    command.env("HF_HUB_DISABLE_SYMLINKS", "1");
    command.env("PYTHONUNBUFFERED", "1");
    command.env("HF_HOME", hf_cache_dir.to_string_lossy().to_string());
    command.env("HF_HUB_CACHE", hf_cache_dir.to_string_lossy().to_string());
    command.env(
        "HUGGINGFACE_HUB_CACHE",
        hf_cache_dir.to_string_lossy().to_string(),
    );
    command.env(
        "TRANSFORMERS_CACHE",
        hf_cache_dir.to_string_lossy().to_string(),
    );
    command.env(
        "SENTENCE_TRANSFORMERS_HOME",
        hf_cache_dir.to_string_lossy().to_string(),
    );
    // Force UTF-8 IO and reduce noisy HF hub warnings
    command.env("PYTHONIOENCODING", "utf-8");
    command.env("PYTHONUTF8", "1");
    command.env("HF_HUB_ENABLE_HF_XET", "0");
    command.env("HF_HUB_DISABLE_TELEMETRY", "1");

    #[cfg(target_os = "linux")]
    {
        use std::env;

        let current_ld = env::var("LD_LIBRARY_PATH").unwrap_or_default();
        let mut paths = Vec::with_capacity(3);
        let internal_dir = resource_dir.join("_internal");
        paths.push(resource_dir.to_string_lossy().to_string());
        paths.push(internal_dir.to_string_lossy().to_string());
        if !current_ld.is_empty() {
            paths.push(current_ld);
        }
        command.env("LD_LIBRARY_PATH", paths.join(":"));
    }
    #[cfg(windows)]
    {
        use std::env;
        #[allow(unused_imports)]
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
        // Ensure bundled DLLs/.pyd can be resolved by the child process
        let current_path = env::var("PATH").unwrap_or_default();
        let internal_dir = resource_dir.join("_internal");
        let mut paths = Vec::new();
        paths.push(resource_dir.to_string_lossy().to_string());
        paths.push(internal_dir.to_string_lossy().to_string());
        if !current_path.is_empty() {
            paths.push(current_path);
        }
        command.env("PATH", paths.join(";"));

        // Force console to use UTF-8 code page for proper Chinese character handling
        command.env("PYTHONIOENCODING", "utf-8:replace");
        command.env("PYTHONUTF8", "1");
    }

    let child = command
        .spawn()
        .map_err(|err| format!("Failed to spawn RPC worker: {err}"))?;
    RpcClient::new(child, Duration::from_secs(30), Some(log_path)).await
}

#[tauri::command]
async fn fetch_backend_status(
    app: tauri::AppHandle,
    rpc_manager: State<'_, RpcManager>,
) -> Result<String, String> {
    let client = rpc_manager.ensure_client(&app).await?;
    // Try health first; fall back to ping for older workers
    match client.call("health", json!({})).await {
        Ok(val) => {
            let status = val
                .get("status")
                .and_then(JsonValue::as_str)
                .map(str::to_string)
                .ok_or_else(|| "Invalid health response".to_string())?;
            Ok(status)
        }
        Err(_) => {
            let pong = client
                .call("ping", json!({}))
                .await?
                .get("status")
                .and_then(JsonValue::as_str)
                .map(str::to_string)
                .ok_or_else(|| "Invalid ping response".to_string())?;
            Ok(pong)
        }
    }
}

#[tauri::command]
async fn fetch_backend_health(
    app: tauri::AppHandle,
    rpc_manager: State<'_, RpcManager>,
) -> Result<JsonValue, String> {
    let client = rpc_manager.ensure_client(&app).await?;
    match client.call("health", json!({})).await {
        Ok(val) => Ok(val),
        Err(err) => {
            if err.contains("-32601") || err.to_lowercase().contains("method not found") {
                client.call("ping", json!({})).await
            } else {
                Err(err)
            }
        }
    }
}

#[tauri::command]
async fn fetch_backend_diagnostics(
    rpc_manager: State<'_, RpcManager>,
    app: tauri::AppHandle,
) -> Result<RpcDiagnostics, String> {
    let client = rpc_manager.ensure_client(&app).await?;
    Ok(client.diagnostics().await)
}

#[tauri::command]
async fn restart_backend(
    app: tauri::AppHandle,
    rpc_manager: State<'_, RpcManager>,
) -> Result<bool, String> {
    let handle = rpc_manager.client_handle();
    RpcManager::shutdown_with(handle).await;
    // spawn new one
    let _ = rpc_manager.ensure_client(&app).await?;
    Ok(true)
}

#[tauri::command]
#[allow(non_snake_case)]
async fn search_term_contexts(
    doc_id: Option<String>,
    docId: Option<String>,
    document_id: Option<String>,
    term: String,
    app: tauri::AppHandle,
    rpc_manager: State<'_, RpcManager>,
) -> Result<Vec<String>, String> {
    let doc_id = doc_id.or(docId).or(document_id).ok_or_else(|| {
        "missing 'doc_id' (accepted keys: doc_id, docId, document_id)".to_string()
    })?;
    let client = rpc_manager.ensure_client(&app).await?;
    let response = client
        .call(
            "search_term_contexts",
            json!({
                "document_id": doc_id,
                "term": term,
                "limit": 5,
            }),
        )
        .await?;

    let payload: SearchResponsePayload =
        serde_json::from_value(response).map_err(|err| format!("Invalid RPC response: {err}"))?;

    Ok(payload
        .results
        .into_iter()
        .map(|entry| entry.chunk_text)
        .collect())
}

#[tauri::command]
#[allow(dead_code)]
async fn upload_document(
    file_path: String,
    file_name: String,
    app: tauri::AppHandle,
    rpc_manager: State<'_, RpcManager>,
) -> Result<UploadPayload, String> {
    // Ensure the file path is valid UTF-8 (critical for Chinese characters on Windows)
    // Rust strings are already UTF-8, but verify the path exists
    let path_check = std::path::Path::new(&file_path);
    if !path_check.exists() {
        return Err(format!("File not found before upload: {}", file_path));
    }

    let client = rpc_manager.ensure_client(&app).await?;

    // Send the path as UTF-8 encoded string via JSON-RPC
    // The file_path will be automatically escaped properly by serde_json
    let response = match client
        .call(
            "upload_document",
            json!({
                "file_path": file_path,
                "file_name": file_name,
            }),
        )
        .await
    {
        Ok(val) => Ok(val),
        Err(e) => {
            if e.contains("Method not found") {
                client
                    .call(
                        "upload",
                        json!({
                            "file_path": file_path,
                            "file_name": file_name,
                        }),
                    )
                    .await
            } else {
                Err(e)
            }
        }
    }?;

    let mut payload: UploadPayload =
        serde_json::from_value(response).map_err(|err| format!("Invalid RPC response: {err}"))?;

    if payload.document_id.trim().is_empty() {
        return Err("Upload failed: missing document_id".to_string());
    }

    if !payload.status.eq_ignore_ascii_case("processed") {
        return Err(format!("Upload failed: {}", payload.status));
    }

    if payload.extracted_text.is_none() {
        payload.extracted_text = Some(String::new());
    }

    if payload.message.is_none() {
        payload.message = Some("Document processed successfully".to_string());
    }

    let _ = tokio_fs::remove_file(&file_path).await;

    Ok(payload)
}

#[tauri::command]
#[allow(dead_code)]
async fn store_temp_document(
    file_name: String,
    contents: Vec<u8>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let base_dir: PathBuf = app
        .path()
        .app_data_dir()
        .map_err(|err| err.to_string())?
        .join("uploads");

    tokio_fs::create_dir_all(&base_dir)
        .await
        .map_err(|err| err.to_string())?;

    // CRITICAL FIX: On Windows, file_name may already be corrupted if it contains
    // Chinese characters due to UTF-8/UTF-16 conversion issues in the IPC layer.
    // Solution: Sanitize to ASCII-safe filename with a hash of the original name.

    let timestamp = Utc::now().timestamp_millis();

    // Check if filename contains non-ASCII characters
    let has_non_ascii = !file_name.is_ascii();

    let unique_name = if has_non_ascii && cfg!(windows) {
        // On Windows with non-ASCII, use hash to avoid encoding issues
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        file_name.hash(&mut hasher);
        let hash = hasher.finish();

        // Extract extension if present
        let ext = Path::new(&file_name)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("bin");

        eprintln!(
            "[store_temp_document] Non-ASCII filename detected: {}",
            file_name
        );
        eprintln!(
            "[store_temp_document] Using hash-based name: upload-{}-{:x}.{}",
            timestamp, hash, ext
        );

        format!("upload-{}-{:x}.{}", timestamp, hash, ext)
    } else {
        // Safe ASCII filename, use as-is
        let sanitized = Path::new(&file_name)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("upload.bin");

        format!("upload-{}-{}", timestamp, sanitized)
    };

    let file_path = base_dir.join(&unique_name);

    // Log the path for debugging
    eprintln!("[store_temp_document] Original name: {}", file_name);
    eprintln!("[store_temp_document] Saving to: {:?}", file_path);

    // Write the file
    tokio_fs::write(&file_path, contents)
        .await
        .map_err(|err| format!("Failed to write file: {}", err))?;

    // Verify the file was created successfully
    if !file_path.exists() {
        return Err("File was not created successfully".to_string());
    }

    // On Windows, ensure we get a proper UTF-8 path string
    // to_str() returns None if the path is not valid UTF-8
    // Use display() as fallback which handles all paths
    file_path.to_str().map(str::to_string).ok_or_else(|| {
        // Fallback: use lossy conversion which replaces invalid UTF-8 with �
        // This should rarely happen with modern Windows (NT paths are UTF-16)
        format!(
            "Path contains invalid UTF-8 characters: {}",
            file_path.display()
        )
    })
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

fn normalize_lower(s: &str) -> String {
    s.to_ascii_lowercase()
}

fn provider_aliases(app: &tauri::AppHandle, provider: &str) -> Vec<String> {
    let mut aliases = vec![provider.to_string()];
    let input_l = normalize_lower(provider);

    // Always add lowercase version
    if input_l != provider {
        aliases.push(input_l.clone());
    }

    // Generic vendor synonyms, tolerate UI label mismatches
    if input_l == "google" || input_l == "gemini" {
        aliases.push("google".to_string());
        aliases.push("gemini".to_string());
        aliases.push("Google Gemini".to_string());
    }
    if input_l == "openai" {
        aliases.push("openai".to_string());
        aliases.push("OpenAI".to_string());
    }
    if input_l == "ollama" {
        aliases.push("ollama".to_string());
        aliases.push("Ollama".to_string());
    }

    // Try to find matching provider in config and add all its attributes as aliases
    if let Ok(config_store) = app.store("lexai-config.store") {
        if let Some(serde_json::Value::Array(entries)) = config_store.get("providers") {
            for entry in entries {
                if let Some(obj) = entry.as_object() {
                    let id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("");
                    let name = obj.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    let vendor = obj.get("vendor").and_then(|v| v.as_str()).unwrap_or("");
                    let id_l = normalize_lower(id);
                    let name_l = normalize_lower(name);
                    let vendor_l = normalize_lower(vendor);

                    // Match by any attribute (case-insensitive)
                    let mut matched = input_l == id_l || input_l == name_l || input_l == vendor_l;

                    // Special case: "google" matches gemini vendor
                    if !matched && input_l == "google" && vendor_l == "gemini" {
                        matched = true;
                    }

                    if matched {
                        // Add all variations as aliases
                        if !id.is_empty() {
                            aliases.push(id.to_string());
                            aliases.push(normalize_lower(id));
                        }
                        if !name.is_empty() {
                            aliases.push(name.to_string());
                            aliases.push(normalize_lower(name));
                        }
                        if !vendor.is_empty() {
                            aliases.push(vendor.to_string());
                            aliases.push(normalize_lower(vendor));
                        }
                        // Extra aliases for gemini/google
                        if vendor_l == "gemini" {
                            aliases.push("google".to_string());
                            aliases.push("Google".to_string());
                        }
                        break;
                    }
                }
            }
        }
    }

    aliases.sort();
    aliases.dedup();
    aliases
}

#[tauri::command]
async fn save_api_key(
    provider: String,
    key: String,
    manager: State<'_, SecretsManager>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    eprintln!(
        "[save_api_key] provider='{}', key.len={}",
        provider,
        key.len()
    );

    let mut variants = provider_aliases(&app, &provider);
    variants.sort();
    variants.dedup();

    eprintln!(
        "[save_api_key] Saving to {} locations: {:?}",
        variants.len(),
        variants
    );

    // Batch save to all aliases at once (only write to disk once)
    manager.save_api_keys_batch(&variants, &key).await?;

    eprintln!("[save_api_key] ✓ Completed");
    Ok(())
}

#[tauri::command]
async fn get_api_key(
    provider: String,
    manager: State<'_, SecretsManager>,
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    // Try exact match first
    if let Some(val) = manager.get_api_key(&provider).await? {
        eprintln!(
            "[get_api_key] ✓ Found '{}' (length: {})",
            provider,
            val.len()
        );
        return Ok(Some(val));
    }

    // Try aliases
    let variants = provider_aliases(&app, &provider);
    for p in &variants {
        if p != &provider {
            if let Some(val) = manager.get_api_key(p).await? {
                eprintln!(
                    "[get_api_key] ✓ Found via alias '{}' (length: {})",
                    p,
                    val.len()
                );
                return Ok(Some(val));
            }
        }
    }

    eprintln!("[get_api_key] ✗ Not found: '{}'", provider);
    Ok(None)
}

#[tauri::command]
async fn has_api_key(
    provider: String,
    manager: State<'_, SecretsManager>,
    app: tauri::AppHandle,
) -> Result<bool, String> {
    for p in provider_aliases(&app, &provider) {
        if manager.has_api_key(&p).await? {
            return Ok(true);
        }
    }
    Ok(false)
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
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_stronghold::Builder::new(|password| {
                hash(password.as_bytes()).as_bytes().to_vec()
            })
            .build(),
        )
        .setup(|app| {
            eprintln!("[Tauri Setup] Starting application setup...");

            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|err| -> Box<dyn Error> { Box::new(err) })?;

            eprintln!("[Tauri Setup] Data dir: {:?}", data_dir);

            fs::create_dir_all(&data_dir).map_err(|err| -> Box<dyn Error> { Box::new(err) })?;

            eprintln!("[Tauri Setup] Created data directory");

            let db_path = data_dir.join("lexai.db");
            let stronghold_path = data_dir.join(STRONGHOLD_SNAPSHOT);
            let master_key = hash(b"lexai-default-master-password");

            // Check if this is first-time initialization
            let is_first_init = !stronghold_path.exists();
            if is_first_init {
                eprintln!("[Tauri Setup] First-time Stronghold initialization (this takes ~10 seconds due to key derivation)...");
            } else {
                eprintln!("[Tauri Setup] Loading existing Stronghold...");
            }

            let stronghold = Stronghold::new(&stronghold_path, master_key.as_bytes().to_vec())
                .map_err(|err| -> Box<dyn Error> { Box::new(err) })?;

            eprintln!("[Tauri Setup] Stronghold ready");

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
            app.manage(RpcManager::new());
            app.manage(BatchState::default());

            if let Some(window) = app.get_webview_window("main") {
                let manager_handle = app.state::<RpcManager>().client_handle();
                let shutdown_handle = manager_handle.clone();
                window.on_window_event(move |event| {
                    if matches!(event, WindowEvent::CloseRequested { .. }) {
                        let shutdown_handle = shutdown_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            RpcManager::shutdown_with(shutdown_handle).await;
                        });
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_backend_status,
            fetch_backend_health,
            fetch_backend_diagnostics,
            restart_backend,
            open_logs_dir,
            search_term_contexts,
            store_temp_document,
            upload_document,
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
            has_api_key,
            fetch_backend_health
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

#[tauri::command]
async fn open_logs_dir(app: tauri::AppHandle) -> Result<bool, String> {
    let logs_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| err.to_string())?
        .join("logs");
    fs::create_dir_all(&logs_dir).map_err(|err| err.to_string())?;

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(logs_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(true);
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(logs_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(true);
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(logs_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(true);
    }

    #[allow(unreachable_code)]
    Ok(false)
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
