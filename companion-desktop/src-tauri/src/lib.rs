use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::oneshot;

mod watcher;
mod snapshot;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct CompanionConfig {
    #[serde(rename = "apiBaseUrl", default)]
    pub api_base_url: String,
    #[serde(rename = "pairToken", default)]
    pub pair_token: String,
    #[serde(rename = "audioWatch", default)]
    pub audio_watch: String,
    #[serde(rename = "trackId", default)]
    pub track_id: String,
    #[serde(rename = "exportDir", default)]
    pub export_dir: String,
    #[serde(rename = "sessionInfoPath", default)]
    pub session_info_path: String,
}

pub struct AppState {
    pub watcher_handle: Mutex<Option<oneshot::Sender<()>>>,
    pub snapshot_handle: Mutex<Option<oneshot::Sender<()>>>,
    pub seen: Mutex<HashMap<String, SeenEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeenEntry {
    pub size: u64,
    pub mtime_ms: u128,
    pub stable_since_ms: u128,
    pub uploaded: bool,
}

fn config_path(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    let _ = std::fs::create_dir_all(&dir);
    dir.join("companion-config.json")
}

fn seen_path(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    let _ = std::fs::create_dir_all(&dir);
    dir.join("seen.json")
}

#[tauri::command]
async fn load_config(app: AppHandle) -> Result<CompanionConfig, String> {
    let path = config_path(&app);
    match tokio::fs::read_to_string(&path).await {
        Ok(raw) => serde_json::from_str(&raw).map_err(|e| e.to_string()),
        Err(_) => Ok(CompanionConfig {
            api_base_url: "https://easeverse.vercel.app".to_string(),
            ..Default::default()
        }),
    }
}

#[tauri::command]
async fn save_config(app: AppHandle, config: CompanionConfig) -> Result<(), String> {
    let path = config_path(&app);
    let raw = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    tokio::fs::write(&path, raw).await.map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct TestPairingResult {
    ok: bool,
    message: String,
}

#[tauri::command]
async fn test_pairing(api_base_url: String, pair_token: String) -> Result<TestPairingResult, String> {
    let base = api_base_url.trim_end_matches('/');
    let url = format!("{}/api/takes/upload", base);
    let resp = reqwest::Client::new()
        .post(&url)
        .bearer_auth(&pair_token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if status == 200 || status == 400 {
        Ok(TestPairingResult {
            ok: true,
            message: format!("status {} — auth OK", status),
        })
    } else {
        Ok(TestPairingResult {
            ok: false,
            message: format!("status {}: {}", status, body.chars().take(120).collect::<String>()),
        })
    }
}

#[tauri::command]
async fn start_watcher(
    app: AppHandle,
    state: State<'_, AppState>,
    config: CompanionConfig,
) -> Result<(), String> {
    {
        let mut guard = state.watcher_handle.lock().unwrap();
        if guard.is_some() {
            return Err("watcher already running".into());
        }
        let (tx, rx) = oneshot::channel();
        *guard = Some(tx);
        let app_clone = app.clone();
        let seen_path = seen_path(&app);
        let cfg = config.clone();
        tokio::spawn(async move {
            if let Err(err) = watcher::run_watcher(app_clone.clone(), cfg, seen_path, rx).await {
                let _ = app_clone.emit("companion-log", format!("watcher exited: {err}"));
            }
        });
    }
    {
        let mut guard = state.snapshot_handle.lock().unwrap();
        if guard.is_none() {
            let (tx, rx) = oneshot::channel();
            *guard = Some(tx);
            let app_clone = app.clone();
            let cfg = config.clone();
            tokio::spawn(async move {
                if let Err(err) = snapshot::run_snapshot_loop(app_clone.clone(), cfg, rx).await {
                    let _ = app_clone.emit("companion-log", format!("snapshot loop exited: {err}"));
                }
            });
        }
    }
    let _ = app.emit("companion-log", "watcher + snapshot poller started");
    Ok(())
}

#[tauri::command]
async fn stop_watcher(state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut guard = state.watcher_handle.lock().unwrap();
        if let Some(tx) = guard.take() {
            let _ = tx.send(());
        }
    }
    {
        let mut guard = state.snapshot_handle.lock().unwrap();
        if let Some(tx) = guard.take() {
            let _ = tx.send(());
        }
    }
    Ok(())
}

pub fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            watcher_handle: Mutex::new(None),
            snapshot_handle: Mutex::new(None),
            seen: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            test_pairing,
            start_watcher,
            stop_watcher
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
