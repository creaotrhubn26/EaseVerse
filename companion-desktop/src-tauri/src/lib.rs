use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::process::Command;
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
    #[serde(rename = "exportIncludeMarkers", default = "default_true")]
    pub export_include_markers: bool,
    #[serde(rename = "exportIncludeRegions", default = "default_true")]
    pub export_include_regions: bool,
    #[serde(rename = "exportIncludeKeepers", default = "default_true")]
    pub export_include_keepers: bool,
}

fn default_true() -> bool { true }

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

#[derive(Serialize)]
struct ImportResult {
    ok: bool,
    message: String,
}

#[tauri::command]
async fn trigger_protools_import(app: AppHandle, markers_path: String) -> Result<ImportResult, String> {
    if markers_path.is_empty() {
        return Ok(ImportResult { ok: false, message: "markers_path is empty — set Export folder first".into() });
    }
    let resource_path = if cfg!(target_os = "macos") {
        app.path()
            .resolve("scripts/easeverse-import.applescript", tauri::path::BaseDirectory::Resource)
            .map_err(|e| e.to_string())?
    } else if cfg!(target_os = "windows") {
        app.path()
            .resolve("scripts/easeverse-import.ahk", tauri::path::BaseDirectory::Resource)
            .map_err(|e| e.to_string())?
    } else {
        return Ok(ImportResult { ok: false, message: "Pro Tools import is only supported on Mac and Windows".into() });
    };

    let _ = app.emit("companion-log", format!("triggering Pro Tools import via {}", resource_path.display()));

    let output = if cfg!(target_os = "macos") {
        Command::new("osascript")
            .arg(&resource_path)
            .arg(&markers_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
    } else {
        // AutoHotkey is auto-detected from PATH on Windows.
        Command::new("AutoHotkey.exe")
            .arg(&resource_path)
            .arg(&markers_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
    };

    match output {
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            if out.status.success() {
                let _ = app.emit("companion-log", "Pro Tools import triggered");
                Ok(ImportResult { ok: true, message: "Sent import command to Pro Tools".into() })
            } else {
                let msg = if stderr.is_empty() {
                    format!("import script exited with {}", out.status)
                } else {
                    stderr
                };
                let _ = app.emit("companion-log", format!("Pro Tools import failed: {}", msg));
                Ok(ImportResult { ok: false, message: msg })
            }
        }
        Err(e) => {
            let hint = if cfg!(target_os = "windows") {
                " (install AutoHotkey from https://www.autohotkey.com if missing)"
            } else {
                " (grant Accessibility permission to this app in System Settings)"
            };
            let msg = format!("could not run import script: {}{}", e, hint);
            let _ = app.emit("companion-log", format!("Pro Tools import failed: {}", msg));
            Ok(ImportResult { ok: false, message: msg })
        }
    }
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

// Device-kode-paring: be backend om en kode (vises i UI), bruker godkjenner i /admin.
#[tauri::command]
async fn device_request(api_base_url: String) -> Result<serde_json::Value, String> {
    let base = api_base_url.trim_end_matches('/');
    let r = reqwest::Client::new()
        .post(format!("{}/api/companion/device", base))
        .json(&serde_json::json!({ "action": "request" }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !r.status().is_success() {
        return Err(format!("request failed: {} {}", r.status(), r.text().await.unwrap_or_default()));
    }
    r.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

// Poll til godkjent → returnerer { status, pairToken? }.
#[tauri::command]
async fn device_poll(api_base_url: String, device_code: String) -> Result<serde_json::Value, String> {
    let base = api_base_url.trim_end_matches('/');
    let r = reqwest::Client::new()
        .post(format!("{}/api/companion/device", base))
        .json(&serde_json::json!({ "action": "poll", "deviceCode": device_code }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    r.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

// Auto-foreslå Pro Tools sin eksport-mappe (nyeste session med Bounced/Audio Files).
#[tauri::command]
fn detect_protools_folder() -> Option<String> {
    let home = dirs::home_dir()?;
    let roots = [
        home.join("Documents/Pro Tools"),
        home.join("Documents/Pro Tools/Sessions"),
        home.join("Music/Pro Tools"),
    ];
    let mut best: Option<(std::time::SystemTime, std::path::PathBuf)> = None;
    for root in roots.iter().filter(|p| p.is_dir()) {
        if let Ok(entries) = std::fs::read_dir(root) {
            for e in entries.flatten() {
                let p = e.path();
                if !p.is_dir() {
                    continue;
                }
                for sub in ["Bounced Files", "Audio Files"] {
                    let cand = p.join(sub);
                    if cand.is_dir() {
                        let m = e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
                        if best.as_ref().map_or(true, |(bm, _)| m > *bm) {
                            best = Some((m, cand));
                        }
                    }
                }
            }
        }
    }
    if let Some((_, p)) = best {
        return Some(p.to_string_lossy().to_string());
    }
    roots.iter().find(|p| p.is_dir()).map(|p| p.to_string_lossy().to_string())
}

// Åpne en URL i standard nettleser (for «Åpne paringsside»).
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let prog = "open";
    #[cfg(target_os = "linux")]
    let prog = "xdg-open";
    #[cfg(target_os = "windows")]
    let prog = "explorer";
    std::process::Command::new(prog).arg(&url).spawn().map_err(|e| e.to_string())?;
    Ok(())
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
            stop_watcher,
            trigger_protools_import,
            device_request,
            device_poll,
            detect_protools_folder,
            open_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
