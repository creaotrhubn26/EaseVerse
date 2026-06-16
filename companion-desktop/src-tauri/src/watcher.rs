use crate::{now_ms, CompanionConfig, SeenEntry};
use serde_json::json;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

const STABILIZE_MS: u128 = 1500;
const POLL_INTERVAL: Duration = Duration::from_millis(2000);
const AUDIO_EXTS: [&str; 3] = ["wav", "aif", "aiff"];
const PROTOOLS_INTERNAL_SUBSTRINGS: [&str; 6] = [
    "fade",
    "wavecache",
    "autosave",
    "reverse",
    "session file backups",
    ".tmp",
];

fn log(app: &AppHandle, msg: impl Into<String>) {
    let _ = app.emit("companion-log", msg.into());
}

fn is_protools_internal(name: &str) -> bool {
    if name.starts_with('.') || name.starts_with('~') || name.starts_with('#') {
        return true;
    }
    let lower = name.to_lowercase();
    PROTOOLS_INTERNAL_SUBSTRINGS
        .iter()
        .any(|s| lower.contains(s))
}

async fn load_seen(path: &Path) -> HashMap<String, SeenEntry> {
    match tokio::fs::read_to_string(path).await {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}

async fn save_seen(path: &Path, seen: &HashMap<String, SeenEntry>) {
    if let Ok(raw) = serde_json::to_string(seen) {
        if let Some(parent) = path.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
        let _ = tokio::fs::write(path, raw).await;
    }
}

pub async fn run_watcher(
    app: AppHandle,
    config: CompanionConfig,
    seen_path: PathBuf,
    mut stop_rx: oneshot::Receiver<()>,
) -> Result<(), String> {
    let watch_root = PathBuf::from(&config.audio_watch);
    if !watch_root.exists() {
        log(&app, format!("audio folder does not exist: {}", watch_root.display()));
        return Err("audio folder not found".into());
    }

    let mut seen: HashMap<String, SeenEntry> = load_seen(&seen_path).await;
    log(&app, format!("loaded {} previously-uploaded entries", seen.iter().filter(|(_, v)| v.uploaded).count()));

    loop {
        tokio::select! {
            _ = &mut stop_rx => {
                log(&app, "watcher stopping");
                return Ok(());
            }
            _ = tokio::time::sleep(POLL_INTERVAL) => {
                if let Err(err) = scan_once(&app, &watch_root, &mut seen, &seen_path, &config).await {
                    log(&app, format!("scan error: {err}"));
                }
            }
        }
    }
}

async fn scan_once(
    app: &AppHandle,
    root: &Path,
    seen: &mut HashMap<String, SeenEntry>,
    seen_path: &Path,
    config: &CompanionConfig,
) -> Result<(), String> {
    let mut entries = tokio::fs::read_dir(root).await.map_err(|e| e.to_string())?;
    let now = now_ms();
    let mut pending: Vec<(PathBuf, String, u64)> = Vec::new();

    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        let path = entry.path();
        let meta = match entry.metadata().await {
            Ok(m) => m,
            Err(_) => continue,
        };
        if !meta.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if is_protools_internal(&name) {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();
        if !AUDIO_EXTS.contains(&ext.as_str()) {
            continue;
        }
        let size = meta.len();
        let mtime_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let key = path.to_string_lossy().to_string();

        match seen.get(&key) {
            None => {
                seen.insert(
                    key.clone(),
                    SeenEntry {
                        size,
                        mtime_ms,
                        stable_since_ms: now,
                        uploaded: false,
                    },
                );
            }
            Some(prev) if prev.uploaded => continue,
            Some(prev) if prev.size != size || prev.mtime_ms != mtime_ms => {
                seen.insert(
                    key.clone(),
                    SeenEntry {
                        size,
                        mtime_ms,
                        stable_since_ms: now,
                        uploaded: false,
                    },
                );
            }
            Some(prev) => {
                if now.saturating_sub(prev.stable_since_ms) >= STABILIZE_MS {
                    pending.push((path.clone(), name.clone(), size));
                }
            }
        }
    }

    for (path, filename, size) in pending {
        match upload_take(app, config, &path, &filename, size).await {
            Ok(url) => {
                let key = path.to_string_lossy().to_string();
                if let Some(entry) = seen.get_mut(&key) {
                    entry.uploaded = true;
                }
                save_seen(seen_path, seen).await;
                log(app, format!("uploaded {} -> {}", filename, url));
            }
            Err(err) => {
                log(app, format!("upload failed for {}: {}", filename, err));
            }
        }
    }
    Ok(())
}

async fn upload_take(
    app: &AppHandle,
    config: &CompanionConfig,
    path: &Path,
    filename: &str,
    size: u64,
) -> Result<String, String> {
    let bytes = tokio::fs::read(path).await.map_err(|e| e.to_string())?;
    let base = config.api_base_url.trim_end_matches('/');
    let content_type = "audio/wav";

    // Steg 1: be /api/takes/upload om en presignert Backblaze B2 PUT-URL
    // (erstatter Vercel Blob handleUpload-flyten).
    let init_body = json!({
        "filename": filename,
        "contentType": content_type,
        "byteSize": size,
    });
    let resp = reqwest::Client::new()
        .post(format!("{}/api/takes/upload", base))
        .bearer_auth(&config.pair_token)
        .json(&init_body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("upload init failed: {} {}", status, body));
    }
    #[derive(serde::Deserialize)]
    struct InitResponse {
        #[serde(rename = "takeId")]
        take_id: String,
        #[serde(rename = "uploadUrl")]
        upload_url: String,
    }
    let init: InitResponse = resp.json().await.map_err(|e| e.to_string())?;

    // Steg 2: PUT bytes direkte til B2 via presignert URL.
    let put = reqwest::Client::new()
        .put(&init.upload_url)
        .header("content-type", content_type)
        .body(bytes)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let put_status = put.status();
    if !put_status.is_success() {
        let body = put.text().await.unwrap_or_default();
        return Err(format!("b2 put failed: {} {}", put_status, body));
    }
    let _ = app.emit("companion-log", format!("b2 put OK ({} bytes)", size));

    // Steg 3: finaliser — oppretter take-rad + starter prosessering.
    let finalize_body = json!({
        "takeId": init.take_id,
        "filename": filename,
        "externalTrackId": if config.track_id.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(config.track_id.clone()) },
        "sourcePath": path.to_string_lossy(),
    });
    let complete = reqwest::Client::new()
        .post(format!("{}/api/takes/finalize", base))
        .bearer_auth(&config.pair_token)
        .json(&finalize_body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let complete_status = complete.status();
    if !complete_status.is_success() {
        let body = complete.text().await.unwrap_or_default();
        return Err(format!("finalize failed: {} {}", complete_status, body));
    }
    #[derive(serde::Deserialize)]
    struct FinalizeResponse {
        take: Option<TakeRef>,
    }
    #[derive(serde::Deserialize)]
    struct TakeRef {
        #[serde(rename = "storageUrl")]
        storage_url: Option<String>,
    }
    let fin: FinalizeResponse = complete.json().await.map_err(|e| e.to_string())?;
    Ok(fin.take.and_then(|t| t.storage_url).unwrap_or_default())
}

#[allow(dead_code)] // beholdt; ikke lenger brukt etter B2-migrering (var for Vercel Blob).
fn urlencode(input: &str) -> String {
    url::form_urlencoded::byte_serialize(input.as_bytes()).collect()
}
