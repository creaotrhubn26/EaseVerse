import type { VercelRequest, VercelResponse } from "@vercel/node";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { putObject, presignDownload, PUBLIC_BASE, isB2Configured } from "../_lib/b2-storage.js";
import ffmpegStatic from "ffmpeg-static";

const mixKey = (sessionId: string) => `easeverse/sessions/${sessionId}/mixdown.wav`;
import ffmpeg from "fluent-ffmpeg";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { getProjectMembership } from "../_lib/projects-db.js";
import {
  getLiveSession,
  setMixdownStatus,
} from "../_lib/sessions-db.js";
import { listTakesForLiveSession } from "../_lib/takes-db.js";

export const config = { maxDuration: 300 };

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  // Åpen avspillings-/nedlastings-proxy (presignert B2 GET) — ingen auth-header.
  if (req.method === "GET" && req.query.download) {
    if (!isB2Configured()) return res.status(503).json({ error: "B2 storage is not configured." });
    const sid = typeof req.query.id === "string" ? req.query.id : null;
    if (!sid) return res.status(400).json({ error: "id required" });
    const url = await presignDownload(mixKey(sid));
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
      status: session.mixdownStatus,
      url: session.mixdownUrl,
      startedAt: session.mixdownStartedAt,
      finishedAt: session.mixdownFinishedAt,
      error: session.mixdownError,
    });
  }

  if (!isB2Configured()) {
    return res
      .status(503)
      .json({ error: "B2 storage is not configured." });
  }
  if (session.mixdownStatus === "processing") {
    return res.status(409).json({ error: "Mixdown already in progress" });
  }

  const takes = await listTakesForLiveSession(sessionId);
  if (takes.length === 0) {
    return res.status(400).json({ error: "No takes to mix" });
  }
  // Materialize an offset per take using recording_starts_at when present.
  const recordingStartsMs = session.recordingStartsAt
    ? new Date(session.recordingStartsAt).getTime()
    : null;
  const items = takes.map((t) => {
    const uploadedMs = new Date(t.uploadedAt).getTime();
    const offsetSec =
      recordingStartsMs && t.durationSec
        ? Math.max(0, (uploadedMs - t.durationSec * 1000 - recordingStartsMs) / 1000)
        : 0;
    return { take: t, offsetSec };
  });

  await setMixdownStatus({ sessionId, status: "processing" });

  // Run the mix in the background so we can return 202 quickly.
  void runMixdown({ sessionId, items }).catch(async (err) => {
    console.error("[mixdown] failed:", err);
    await setMixdownStatus({
      sessionId,
      status: "error",
      error: (err as Error).message?.slice(0, 500) || "Unknown error",
    });
  });

  return res.status(202).json({ status: "processing" });
}

type MixItem = {
  take: { id: string; storageUrl: string; filename: string };
  offsetSec: number;
};

async function runMixdown(args: { sessionId: string; items: MixItem[] }): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `mix-${args.sessionId}-`));
  const inputPaths: string[] = [];
  try {
    for (const it of args.items) {
      const ext = guessExt(it.take.filename);
      const localPath = path.join(tmpDir, `${it.take.id}${ext}`);
      await downloadTo(it.take.storageUrl, localPath);
      inputPaths.push(localPath);
    }

    const outputPath = path.join(tmpDir, "mix.wav");
    const filter = args.items
      .map((it, i) => {
        const ms = Math.round(it.offsetSec * 1000);
        // Apply adelay to both channels (stereo) — works for mono too.
        return `[${i}:a]adelay=${ms}|${ms},aformat=channel_layouts=stereo[a${i}]`;
      })
      .join("; ");
    const mixInputs = args.items.map((_, i) => `[a${i}]`).join("");
    const fullFilter = `${filter}; ${mixInputs}amix=inputs=${args.items.length}:duration=longest:normalize=0[out]`;

    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg();
      for (const p of inputPaths) cmd.input(p);
      cmd
        .complexFilter(fullFilter, ["out"])
        .audioFrequency(48000)
        .audioChannels(2)
        .audioCodec("pcm_s16le")
        .format("wav")
        .on("error", (err) => reject(err))
        .on("end", () => resolve())
        .save(outputPath);
    });

    const stat = fs.statSync(outputPath);
    const buffer = fs.readFileSync(outputPath);
    await putObject(mixKey(args.sessionId), buffer, "audio/wav");
    const mixdownUrl = `${PUBLIC_BASE}/api/sessions/mixdown?id=${encodeURIComponent(args.sessionId)}&download=1`;

    await setMixdownStatus({
      sessionId: args.sessionId,
      status: "done",
      mixdownUrl,
    });

    console.log("[mixdown] done", { sessionId: args.sessionId, bytes: stat.size, url: mixdownUrl });
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
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

function guessExt(filename: string): string {
  const m = filename.match(/\.([a-z0-9]+)$/i);
  if (!m) return ".bin";
  return `.${m[1].toLowerCase()}`;
}
