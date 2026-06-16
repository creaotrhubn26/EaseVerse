import type { VercelRequest, VercelResponse } from "@vercel/node";
import archiver from "archiver";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { putObject, presignDownload, PUBLIC_BASE, isB2Configured } from "../_lib/b2-storage.js";
import ffmpegStatic from "ffmpeg-static";

const dawKey = (sessionId: string) => `easeverse/sessions/${sessionId}/daw.zip`;
import ffmpeg from "fluent-ffmpeg";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { getProjectMembership } from "../_lib/projects-db.js";
import {
  getDebrief,
  getLiveSession,
  listParticipants,
  setDawBundleStatus,
} from "../_lib/sessions-db.js";
import { listTakesForLiveSession } from "../_lib/takes-db.js";

export const config = { maxDuration: 300 };

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);

const MAX_TAKES = 24;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  // Åpen nedlastings-proxy (presignert B2 GET) — ingen auth-header trengs.
  if (req.method === "GET" && req.query.download) {
    if (!isB2Configured()) return res.status(503).json({ error: "B2 storage is not configured." });
    const sid = typeof req.query.id === "string" ? req.query.id : null;
    if (!sid) return res.status(400).json({ error: "id required" });
    const url = await presignDownload(dawKey(sid));
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.redirect(302, url);
  }
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const sessionId = typeof req.query.id === "string" ? req.query.id : null;
  if (!sessionId) return res.status(400).json({ error: "id required" });
  const session = await getLiveSession(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  const membership = await getProjectMembership(session.projectId, userId);
  if (!membership) return res.status(403).json({ error: "Not a project member" });

  if (req.method === "GET") {
    return res.status(200).json({
      status: session.dawBundleStatus,
      url: session.dawBundleUrl,
      startedAt: session.dawBundleStartedAt,
      finishedAt: session.dawBundleFinishedAt,
      error: session.dawBundleError,
    });
  }

  if (!isB2Configured()) {
    return res.status(503).json({ error: "B2 storage is not configured." });
  }
  if (session.dawBundleStatus === "processing") {
    return res.status(409).json({ error: "DAW export already in progress" });
  }

  const takes = await listTakesForLiveSession(sessionId);
  if (takes.length === 0) {
    return res.status(400).json({ error: "No takes to export" });
  }
  if (takes.length > MAX_TAKES) {
    return res
      .status(413)
      .json({ error: `Too many takes (${takes.length}); max ${MAX_TAKES} per export` });
  }

  await setDawBundleStatus({ sessionId, status: "processing" });

  void runDawExport({ sessionId }).catch(async (err) => {
    console.error("[daw-export] failed:", err);
    await setDawBundleStatus({
      sessionId,
      status: "error",
      error: (err as Error).message?.slice(0, 500) || "Unknown error",
    });
  });

  return res.status(202).json({ status: "processing" });
}

type StemItem = {
  takeId: string;
  trackName: string;
  stemPath: string;
  stemFilename: string;
  offsetSec: number;
  durationSec: number;
};

async function runDawExport(args: { sessionId: string }): Promise<void> {
  const session = await getLiveSession(args.sessionId);
  if (!session) throw new Error("Session disappeared");
  const takes = await listTakesForLiveSession(args.sessionId);
  const participants = await listParticipants(args.sessionId);
  const debrief = await getDebrief(args.sessionId);

  const nameByUser = new Map(
    participants.map((p) => [p.userId, p.displayName ?? p.userId.slice(0, 8)]),
  );

  const recordingStartsMs = session.recordingStartsAt
    ? new Date(session.recordingStartsAt).getTime()
    : null;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `dawx-${args.sessionId}-`));
  const stemsDir = path.join(tmpDir, "stems");
  fs.mkdirSync(stemsDir, { recursive: true });
  const stems: StemItem[] = [];

  try {
    for (const t of takes) {
      const uploadedMs = new Date(t.uploadedAt).getTime();
      const offsetSec =
        recordingStartsMs && t.durationSec
          ? Math.max(0, (uploadedMs - t.durationSec * 1000 - recordingStartsMs) / 1000)
          : 0;
      const downloadPath = path.join(tmpDir, `${t.id}.src`);
      await downloadTo(t.storageUrl, downloadPath);

      const baseName = sanitize(nameByUser.get(t.userId) ?? t.userId.slice(0, 8));
      const stemFilename = `${baseName}-${t.id.slice(0, 8)}.wav`;
      const stemPath = path.join(stemsDir, stemFilename);
      const ms = Math.round(offsetSec * 1000);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(downloadPath)
          .audioFilter(`adelay=${ms}|${ms},aformat=channel_layouts=stereo`)
          .audioFrequency(48000)
          .audioChannels(2)
          .audioCodec("pcm_s16le")
          .format("wav")
          .on("error", reject)
          .on("end", () => resolve())
          .save(stemPath);
      });
      try {
        fs.unlinkSync(downloadPath);
      } catch {
        /* ignore */
      }

      const stat = fs.statSync(stemPath);
      // Stereo 48k 16-bit ≈ 192_000 bytes/sec; subtract 44-byte WAV header.
      const totalSec = Math.max(0, (stat.size - 44) / (48_000 * 2 * 2));
      stems.push({
        takeId: t.id,
        trackName: nameByUser.get(t.userId) ?? t.userId.slice(0, 8),
        stemPath,
        stemFilename,
        offsetSec,
        durationSec: totalSec,
      });
    }

    const projectName = `easeverse-${args.sessionId}`;
    const rppContent = buildReaperProject({
      projectName,
      bpm: session.bpm ?? 96,
      stems,
      markers: debrief?.sections ?? [],
    });
    fs.writeFileSync(path.join(tmpDir, `${projectName}.rpp`), rppContent);

    const markersCsv = buildMarkersCsv(debrief?.sections ?? []);
    fs.writeFileSync(path.join(tmpDir, "markers.csv"), markersCsv);

    const manifest = {
      sessionId: args.sessionId,
      externalTrackId: session.externalTrackId,
      bpm: session.bpm,
      recordingStartsAt: session.recordingStartsAt,
      stems: stems.map((s) => ({
        file: `stems/${s.stemFilename}`,
        trackName: s.trackName,
        takeId: s.takeId,
        offsetSec: 0,
        durationSec: s.durationSec,
        originalOffsetSec: s.offsetSec,
      })),
      markers: (debrief?.sections ?? []).map((m) => ({
        label: m.label,
        type: m.type,
        startSec: m.startSec,
        endSec: m.endSec,
      })),
      readme:
        "Open the .rpp in Reaper (free at reaper.fm) for an instant timeline with stems aligned, BPM set, and debrief markers as section labels. From Reaper use File → Export Project as AAF/OMF for Pro Tools, Logic, or Ableton.",
    };
    fs.writeFileSync(path.join(tmpDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(
      path.join(tmpDir, "README.txt"),
      [
        `EaseVerse DAW export — session ${args.sessionId}`,
        ``,
        `Quickest path: open ${projectName}.rpp in Reaper (free download at https://www.reaper.fm).`,
        `Stems are pre-padded with silence so any DAW can import them as time-aligned tracks.`,
        ``,
        `Files:`,
        `  - ${projectName}.rpp   Reaper project (open directly)`,
        `  - stems/               Pre-padded WAV per take, ready for any DAW`,
        `  - markers.csv          Section markers (importable in PT/Logic/Ableton)`,
        `  - manifest.json        Structured metadata for other tools`,
      ].join("\n"),
    );

    const zipPath = path.join(tmpDir, `${projectName}.zip`);
    await packBundle({
      sourceDir: tmpDir,
      files: [
        `${projectName}.rpp`,
        "manifest.json",
        "markers.csv",
        "README.txt",
        ...stems.map((s) => `stems/${s.stemFilename}`),
      ],
      outPath: zipPath,
    });

    const zipBytes = fs.readFileSync(zipPath);
    await putObject(dawKey(args.sessionId), zipBytes, "application/zip");
    const url = `${PUBLIC_BASE}/api/sessions/daw-export?id=${encodeURIComponent(args.sessionId)}&download=1`;

    await setDawBundleStatus({
      sessionId: args.sessionId,
      status: "done",
      url,
    });
    console.log("[daw-export] done", {
      sessionId: args.sessionId,
      bytes: zipBytes.length,
      stems: stems.length,
      url,
    });
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function buildReaperProject(args: {
  projectName: string;
  bpm: number;
  stems: StemItem[];
  markers: { label: string; startSec: number }[];
}): string {
  const lines: string[] = [];
  lines.push(`<REAPER_PROJECT 0.1 "7.00" 0`);
  lines.push(`  RIPPLE 0`);
  lines.push(`  GROUPOVERRIDE 0 0 0`);
  lines.push(`  AUTOXFADE 1`);
  lines.push(`  ENVATTACH 1`);
  lines.push(`  POOLEDENVATTACH 0`);
  lines.push(`  MIXERUIFLAGS 11 48`);
  lines.push(`  PEAKGAIN 1`);
  lines.push(`  FEEDBACK 0`);
  lines.push(`  PANLAW 1`);
  lines.push(`  PROJOFFS 0 0 0`);
  lines.push(`  MAXPROJLEN 0 0`);
  lines.push(`  GRID 3199 8 1 8 1 0 0 0`);
  lines.push(`  TIMEMODE 1 5 -1 30 0 0 -1`);
  lines.push(`  VIDEO_CONFIG 0 0 256`);
  lines.push(`  PANMODE 3`);
  lines.push(`  CURSOR 0`);
  lines.push(`  ZOOM 100 0 0`);
  lines.push(`  VZOOMEX 6 0`);
  lines.push(`  USE_REC_CFG 0`);
  lines.push(`  RECMODE 1`);
  lines.push(`  SMPTESYNC 0 30 100 40 1000 300 0 0 1 0 0`);
  lines.push(`  LOOP 0`);
  lines.push(`  LOOPGRAN 0 4`);
  lines.push(`  RECORD_PATH "" ""`);
  lines.push(`  <RECORD_CFG`);
  lines.push(`  >`);
  lines.push(`  <APPLYFX_CFG`);
  lines.push(`  >`);
  lines.push(`  RENDER_FILE ""`);
  lines.push(`  RENDER_PATTERN ""`);
  lines.push(`  RENDER_FMT 0 2 0`);
  lines.push(`  RENDER_1X 0`);
  lines.push(`  RENDER_RANGE 1 0 0 18 1000`);
  lines.push(`  RENDER_RESAMPLE 3 0 1`);
  lines.push(`  RENDER_ADDTOPROJ 0`);
  lines.push(`  RENDER_STEMS 0`);
  lines.push(`  RENDER_DITHER 0`);
  lines.push(`  TIMELOCKMODE 1`);
  lines.push(`  TEMPOENVLOCKMODE 1`);
  lines.push(`  ITEMMIX 0`);
  lines.push(`  DEFPITCHMODE 589824 0`);
  lines.push(`  TAKELANE 1`);
  lines.push(`  SAMPLERATE 48000 0 0`);
  // Tempo: TEMPO bpm numerator denominator
  lines.push(`  TEMPO ${args.bpm} 4 4`);

  // Markers: MARKER id position "name" isregion color flags
  args.markers.forEach((m, idx) => {
    const safe = m.label.replace(/"/g, "'");
    lines.push(`  MARKER ${idx + 1} ${m.startSec.toFixed(3)} "${safe}" 0 0 1 R`);
  });

  // Tracks
  for (const s of args.stems) {
    const safeName = s.trackName.replace(/"/g, "'");
    lines.push(`  <TRACK`);
    lines.push(`    NAME "${safeName}"`);
    lines.push(`    PEAKCOL 16576`);
    lines.push(`    BEAT -1`);
    lines.push(`    AUTOMODE 0`);
    lines.push(`    VOLPAN 1 0 -1 -1 1`);
    lines.push(`    MUTESOLO 0 0 0`);
    lines.push(`    IPHASE 0`);
    lines.push(`    ISBUS 0 0`);
    lines.push(`    BUSCOMP 0 0 0 0 0`);
    lines.push(`    SHOWINMIX 1 0.6667 0.5 1 0.5 0 0 0`);
    lines.push(`    FREEMODE 0`);
    lines.push(`    SEL 0`);
    lines.push(`    REC 0 0 0 0 0 0 0 0`);
    lines.push(`    VU 2`);
    lines.push(`    TRACKHEIGHT 0 0 0 0 0 0`);
    lines.push(`    INQ 0 0 0 0.5 100 0 0 100`);
    lines.push(`    NCHAN 2`);
    lines.push(`    FX 1`);
    lines.push(`    TRACKID {${randomGuid()}}`);
    lines.push(`    PERF 0`);
    lines.push(`    MIDIOUT -1`);
    lines.push(`    MAINSEND 1 0`);
    lines.push(`    <ITEM`);
    lines.push(`      POSITION 0`);
    lines.push(`      SNAPOFFS 0`);
    lines.push(`      LENGTH ${s.durationSec.toFixed(6)}`);
    lines.push(`      LOOP 0`);
    lines.push(`      ALLTAKES 0`);
    lines.push(`      FADEIN 1 0 0 1 0 0 0`);
    lines.push(`      FADEOUT 1 0 0 1 0 0 0`);
    lines.push(`      MUTE 0 0`);
    lines.push(`      SEL 0`);
    lines.push(`      IGUID {${randomGuid()}}`);
    lines.push(`      IID 1`);
    lines.push(`      NAME "${safeName}"`);
    lines.push(`      VOLPAN 1 0 1 -1`);
    lines.push(`      SOFFS 0`);
    lines.push(`      PLAYRATE 1 1 0 -1 0 0.0025`);
    lines.push(`      CHANMODE 0`);
    lines.push(`      GUID {${randomGuid()}}`);
    lines.push(`      <SOURCE WAVE`);
    lines.push(`        FILE "stems/${s.stemFilename}"`);
    lines.push(`      >`);
    lines.push(`    >`);
    lines.push(`  >`);
  }

  lines.push(`>`);
  return lines.join("\n");
}

function buildMarkersCsv(markers: { label: string; type: string; startSec: number; endSec: number }[]): string {
  const head = "Name,Start,Length,Type";
  const body = markers
    .map((m) => {
      const len = Math.max(0, m.endSec - m.startSec);
      const name = m.label.replace(/"/g, "'").replace(/,/g, " ");
      return `${name},${m.startSec.toFixed(3)},${len.toFixed(3)},${m.type}`;
    })
    .join("\n");
  return `${head}\n${body}\n`;
}

function sanitize(name: string): string {
  return name.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 32) || "track";
}

function randomGuid(): string {
  return crypto.randomUUID().toUpperCase();
}

async function packBundle(args: {
  sourceDir: string;
  files: string[];
  outPath: string;
}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(args.outPath);
    const zip = archiver("zip", { zlib: { level: 6 } });
    output.on("close", () => resolve());
    output.on("error", reject);
    zip.on("error", reject);
    zip.pipe(output);
    for (const rel of args.files) {
      const full = path.join(args.sourceDir, rel);
      if (!fs.existsSync(full)) continue;
      zip.file(full, { name: rel });
    }
    void zip.finalize();
  });
}

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`download ${url} failed: ${res.status}`);
  }
  const fileStream = fs.createWriteStream(dest);
  const nodeStream = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
  await new Promise<void>((resolve, reject) => {
    nodeStream.pipe(fileStream);
    nodeStream.on("error", reject);
    fileStream.on("finish", () => resolve());
    fileStream.on("error", reject);
  });
}
