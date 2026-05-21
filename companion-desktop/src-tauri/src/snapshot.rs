use crate::CompanionConfig;
use serde::{Deserialize, Serialize};
use std::fs::Metadata;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CompanionSnapshot {
    #[serde(rename = "generatedAt")]
    pub generated_at: String,
    pub keepers: Vec<SnapshotKeeper>,
    pub markers: Vec<SnapshotMarker>,
    pub regions: Vec<SnapshotRegion>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SnapshotKeeper {
    pub id: String,
    pub filename: String,
    #[serde(rename = "sourcePath")]
    pub source_path: Option<String>,
    #[serde(rename = "externalTrackId")]
    pub external_track_id: Option<String>,
    #[serde(rename = "durationSec")]
    pub duration_sec: Option<f64>,
    #[serde(rename = "uploadedAt")]
    pub uploaded_at: String,
    #[serde(rename = "decisionLockedAt")]
    pub decision_locked_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SnapshotMarker {
    #[serde(rename = "takeId")]
    pub take_id: String,
    pub filename: String,
    pub seconds: f64,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SnapshotRegion {
    pub filename: String,
    #[serde(rename = "startSec")]
    pub start_sec: f64,
    #[serde(rename = "endSec")]
    pub end_sec: f64,
    pub label: Option<String>,
}

fn seconds_to_timecode(seconds: f64) -> String {
    let total = seconds.max(0.0);
    let h = (total / 3600.0).floor() as u32;
    let m = ((total % 3600.0) / 60.0).floor() as u32;
    let s = (total % 60.0).floor() as u32;
    let f = ((total - total.floor()) * 24.0).floor() as u32;
    format!("{:02}:{:02}:{:02}:{:02}", h, m, s, f)
}

fn sanitize(s: &str) -> String {
    s.chars()
        .filter(|c| !matches!(c, '\t' | '\r' | '\n'))
        .take(80)
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn build_markers_txt(snapshot: &CompanionSnapshot) -> String {
    #[derive(Clone)]
    struct Entry {
        seconds: f64,
        name: String,
    }
    let mut entries: Vec<Entry> = Vec::new();
    for m in &snapshot.markers {
        let name = sanitize(m.label.as_deref().unwrap_or(""));
        let name = if name.is_empty() {
            format!("Note · {}", sanitize(&m.filename))
        } else {
            name
        };
        entries.push(Entry { seconds: m.seconds, name });
    }
    for r in &snapshot.regions {
        let label = sanitize(r.label.as_deref().unwrap_or("Region"));
        entries.push(Entry { seconds: r.start_sec, name: format!("[Loop start] {}", label) });
        entries.push(Entry { seconds: r.end_sec, name: format!("[Loop end] {}", label) });
    }
    entries.sort_by(|a, b| a.seconds.partial_cmp(&b.seconds).unwrap_or(std::cmp::Ordering::Equal));
    let mut lines = vec![
        "SESSION NAME:\tEaseVerse Markers Export".to_string(),
        "SAMPLE RATE:\t48000".to_string(),
        String::new(),
        "MEMORY LOCATIONS".to_string(),
        "#\tName\tTimecode".to_string(),
    ];
    for (i, e) in entries.iter().enumerate() {
        lines.push(format!("{}\t{}\t{}", i + 1, e.name, seconds_to_timecode(e.seconds)));
    }
    lines.push(String::new());
    lines.join("\n")
}

pub fn build_keepers_txt(snapshot: &CompanionSnapshot) -> String {
    let mut lines = vec![
        "EaseVerse — Producer decisions".to_string(),
        format!("Generated: {}", snapshot.generated_at),
        String::new(),
    ];
    if !snapshot.keepers.is_empty() {
        lines.push("✅ KEEPERS (colour these tracks green in Pro Tools)".to_string());
        for k in &snapshot.keepers {
            let locked = k.decision_locked_at.as_ref()
                .map(|t| format!(" · 🔒 locked {}", t))
                .unwrap_or_default();
            let path = k.source_path.as_ref()
                .map(|p| format!(" · {}", p))
                .unwrap_or_default();
            lines.push(format!("  • {}{}{}", k.filename, path, locked));
        }
        lines.push(String::new());
    }
    if !snapshot.markers.is_empty() {
        lines.push("📍 PRODUCER NOTES WITH TIMESTAMPS".to_string());
        for m in &snapshot.markers {
            let tc = seconds_to_timecode(m.seconds);
            let label = sanitize(m.label.as_deref().unwrap_or(""));
            let label = if label.is_empty() { "(no comment)".to_string() } else { label };
            lines.push(format!("  • {} @ {} — {}", m.filename, tc, label));
        }
        lines.push(String::new());
    }
    if !snapshot.regions.is_empty() {
        lines.push("🔁 LOOP-PUNCH REGIONS".to_string());
        for r in &snapshot.regions {
            let label = sanitize(r.label.as_deref().unwrap_or("(unlabeled)"));
            lines.push(format!(
                "  • {} {} → {} — {}",
                r.filename,
                seconds_to_timecode(r.start_sec),
                seconds_to_timecode(r.end_sec),
                label
            ));
        }
        lines.push(String::new());
    }
    if lines.len() <= 3 {
        lines.push("(No decisions, notes, or regions yet.)".to_string());
    }
    lines.push("---".to_string());
    lines.push("Import into Pro Tools: File → Import → Session Data → choose easeverse-markers.txt,".to_string());
    lines.push("enable \"Memory Locations / Markers\". Keeper colours are manual today.".to_string());
    lines.join("\n")
}

pub async fn fetch_snapshot(config: &CompanionConfig) -> Result<CompanionSnapshot, String> {
    let base = config.api_base_url.trim_end_matches('/');
    let mut url = format!("{}/api/companion/snapshot", base);
    let mut query: Vec<(&str, &str)> = Vec::new();
    if !config.track_id.is_empty() {
        query.push(("trackId", config.track_id.as_str()));
    }
    if !query.is_empty() {
        let qs = query
            .iter()
            .map(|(k, v)| format!("{}={}", k, urlencoding(v)))
            .collect::<Vec<_>>()
            .join("&");
        url = format!("{}?{}", url, qs);
    }
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .bearer_auth(&config.pair_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("snapshot {}: {}", status, body));
    }
    resp.json::<CompanionSnapshot>().await.map_err(|e| e.to_string())
}

pub async fn post_checkpoint(config: &CompanionConfig, source: &str, payload: serde_json::Value) -> Result<(), String> {
    let base = config.api_base_url.trim_end_matches('/');
    let url = format!("{}/api/companion/checkpoint", base);
    let body = serde_json::json!({
        "externalTrackId": if config.track_id.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(config.track_id.clone()) },
        "source": source,
        "payload": payload,
    });
    let resp = reqwest::Client::new()
        .post(&url)
        .bearer_auth(&config.pair_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("checkpoint {}", resp.status()));
    }
    Ok(())
}

fn urlencoding(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

pub async fn write_export_files(out_dir: &Path, snapshot: &CompanionSnapshot) -> Result<(bool, bool), String> {
    tokio::fs::create_dir_all(out_dir).await.map_err(|e| e.to_string())?;
    let markers = build_markers_txt(snapshot);
    let keepers = build_keepers_txt(snapshot);

    let markers_path = out_dir.join("easeverse-markers.txt");
    let keepers_path = out_dir.join("easeverse-keepers.txt");

    let mut wrote_markers = false;
    let prev = tokio::fs::read_to_string(&markers_path).await.unwrap_or_default();
    if prev != markers {
        tokio::fs::write(&markers_path, markers).await.map_err(|e| e.to_string())?;
        wrote_markers = true;
    }

    let mut wrote_keepers = false;
    let prev_k = tokio::fs::read_to_string(&keepers_path).await.unwrap_or_default();
    if prev_k != keepers {
        tokio::fs::write(&keepers_path, keepers).await.map_err(|e| e.to_string())?;
        wrote_keepers = true;
    }

    Ok((wrote_markers, wrote_keepers))
}

pub async fn run_snapshot_loop(
    app: AppHandle,
    config: CompanionConfig,
    mut stop_rx: oneshot::Receiver<()>,
) -> Result<(), String> {
    let export_dir = if config.export_dir.is_empty() {
        None
    } else {
        Some(PathBuf::from(&config.export_dir))
    };
    let session_info_path = if config.session_info_path.is_empty() {
        None
    } else {
        Some(PathBuf::from(&config.session_info_path))
    };

    let _ = app.emit("companion-log", "snapshot poller started");
    let mut last_session_info_mtime: Option<u128> = None;

    loop {
        tokio::select! {
            _ = &mut stop_rx => {
                let _ = app.emit("companion-log", "snapshot poller stopping");
                return Ok(());
            }
            _ = tokio::time::sleep(Duration::from_secs(5)) => {
                match fetch_snapshot(&config).await {
                    Ok(snap) => {
                        let _ = app.emit(
                            "companion-log",
                            format!(
                                "snapshot: {} keepers · {} markers · {} regions",
                                snap.keepers.len(),
                                snap.markers.len(),
                                snap.regions.len()
                            ),
                        );
                        if let Some(dir) = &export_dir {
                            match write_export_files(dir, &snap).await {
                                Ok((m, k)) => {
                                    if m || k {
                                        let _ = app.emit(
                                            "companion-log",
                                            format!("wrote Pro Tools export files (markers={}, keepers={})", m, k),
                                        );
                                    }
                                }
                                Err(e) => {
                                    let _ = app.emit("companion-log", format!("export error: {}", e));
                                }
                            }
                        }
                    }
                    Err(e) => {
                        let _ = app.emit("companion-log", format!("snapshot fetch failed: {}", e));
                    }
                }

                // Session-info file checkpoint
                if let Some(path) = &session_info_path {
                    if let Ok(md) = tokio::fs::metadata(path).await {
                        let mtime = file_mtime_ms(&md);
                        if Some(mtime) != last_session_info_mtime {
                            last_session_info_mtime = Some(mtime);
                            if let Ok(contents) = tokio::fs::read_to_string(path).await {
                                let payload = serde_json::json!({
                                    "size": contents.len(),
                                    "content": contents.chars().take(50_000).collect::<String>(),
                                });
                                match post_checkpoint(&config, "protools-session-info", payload).await {
                                    Ok(()) => {
                                        let _ = app.emit("companion-log", "checkpoint posted (session-info changed)");
                                    }
                                    Err(e) => {
                                        let _ = app.emit("companion-log", format!("checkpoint failed: {}", e));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

fn file_mtime_ms(meta: &Metadata) -> u128 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0)
}
