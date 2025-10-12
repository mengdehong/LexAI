use std::error::Error;

use reqwest::Client;
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use tauri::Manager;

#[derive(Clone)]
struct DbState(SqlitePool);

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

async fn init_database() -> Result<SqlitePool, sqlx::Error> {
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect("sqlite:lexai.db")
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let pool = tauri::async_runtime::block_on(init_database())
                .map_err(|err| -> Box<dyn Error> { Box::new(err) })?;
            app.manage(DbState(pool));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![fetch_backend_status])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
