import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { Pool } from "pg";
import { ensureTakesSchema, listRegionsForTakes } from "../_lib/takes-db.js";
import { getProjectReferenceTrack } from "../_lib/projects-db.js";

export const config = { maxDuration: 60 };

// Server-Sent Events stream of the same booth payload that /api/booth
// returns, but pushed every time state changes (vs the old 2s poll).
// Holds the connection for ~50s, then EventSource on the client
// reconnects automatically, so we stay inside Vercel's 60s function cap.
const HOLD_MS = 50_000;
const POLL_MS = 1500;

let pool: Pool | null = null;
function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return pool;
}

async function buildPayload(trackId: string): Promise<unknown> {
  const p = getPool();
  if (!p) return null;
  await ensureTakesSchema();
  const { rows: lyricsRows } = await p.query<{
    external_track_id: string;
    title: string | null;
    lyrics: string | null;
    bpm: number | null;
    updated_at: string;
  }>(
    `SELECT external_track_id, title, lyrics, bpm, updated_at
     FROM collab_lyrics_drafts
     WHERE external_track_id = $1
     ORDER BY updated_at DESC LIMIT 1`,
    [trackId],
  );
  const { rows: takeRows } = await p.query<{
    id: string;
    filename: string;
    uploaded_at: string;
    duration_sec: number | null;
    status: string;
    storage_url: string;
    producer_note: string | null;
    producer_decision: string | null;
    producer_memo_url: string | null;
    producer_memo_duration_sec: number | null;
    decision_locked_at: string | null;
    lyrics_snapshot: string | null;
    lyrics_snapshot_at: string | null;
    project_id: string | null;
    agree_count: string | number | null;
    disagree_count: string | number | null;
    transcript: string | null;
    ai_notes: string | null;
    pitch_mean_hz: number | null;
    energy_avg_db: number | null;
  }>(
    `SELECT t.id, t.filename, t.uploaded_at, t.duration_sec, t.status, t.storage_url,
            t.producer_note, t.producer_decision,
            t.producer_memo_url, t.producer_memo_duration_sec, t.decision_locked_at,
            t.lyrics_snapshot, t.lyrics_snapshot_at, t.project_id,
            (SELECT COUNT(*) FROM take_consensus_votes v WHERE v.take_id = t.id AND v.vote = 'agree') AS agree_count,
            (SELECT COUNT(*) FROM take_consensus_votes v WHERE v.take_id = t.id AND v.vote = 'disagree') AS disagree_count,
            a.transcript, a.ai_notes, a.pitch_mean_hz, a.energy_avg_db
     FROM takes t
     LEFT JOIN take_analyses a ON a.take_id = t.id
     WHERE t.external_track_id = $1
     ORDER BY t.uploaded_at DESC LIMIT 20`,
    [trackId],
  );
  const regionMap = await listRegionsForTakes(takeRows.map((t) => t.id));
  let referenceTrack: { url: string; name: string | null; durationSec: number | null } | null = null;
  const firstProjectTake = takeRows.find((t) => t.project_id);
  if (firstProjectTake?.project_id) {
    const ref = await getProjectReferenceTrack(firstProjectTake.project_id);
    if (ref?.url) referenceTrack = { url: ref.url, name: ref.name, durationSec: ref.durationSec };
  }
  return {
    trackId,
    lyrics: lyricsRows[0]
      ? {
          title: lyricsRows[0].title,
          lyrics: lyricsRows[0].lyrics,
          bpm: lyricsRows[0].bpm,
          updatedAt: lyricsRows[0].updated_at,
        }
      : null,
    referenceTrack,
    takes: takeRows.map((t) => ({
      id: t.id,
      filename: t.filename,
      uploadedAt: t.uploaded_at,
      durationSec: t.duration_sec,
      status: t.status,
      audioUrl: t.storage_url,
      producerNote: t.producer_note,
      producerDecision:
        t.producer_decision === "keeper" || t.producer_decision === "redo" ? t.producer_decision : null,
      producerMemoUrl: t.producer_memo_url,
      producerMemoDurationSec: t.producer_memo_duration_sec,
      decisionLockedAt: t.decision_locked_at,
      consensus: {
        agree: Number(t.agree_count ?? 0),
        disagree: Number(t.disagree_count ?? 0),
      },
      regions: (regionMap.get(t.id) ?? []).map((r) => ({
        id: r.id,
        startSec: r.startSec,
        endSec: r.endSec,
        label: r.label,
        color: r.color,
        autoLoop: r.autoLoop,
      })),
      lyricsSnapshot: t.lyrics_snapshot,
      lyricsSnapshotAt: t.lyrics_snapshot_at,
      transcript: t.transcript,
      aiNotes: t.ai_notes,
      pitchMeanHz: t.pitch_mean_hz,
      energyAvgDb: t.energy_avg_db,
    })),
  };
}

function hashPayload(obj: unknown): string {
  return crypto.createHash("sha1").update(JSON.stringify(obj)).digest("hex");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const trackId = typeof req.query.trackId === "string" ? req.query.trackId : null;
  if (!trackId) return res.status(400).json({ error: "trackId required" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Hint client to reconnect right away if we drop.
  res.write("retry: 1000\n\n");

  const started = Date.now();
  let lastHash = "";
  let closed = false;
  req.on("close", () => {
    closed = true;
  });

  // Send the first snapshot immediately so the page paints without waiting.
  try {
    const initial = await buildPayload(trackId);
    if (initial) {
      lastHash = hashPayload(initial);
      res.write(`event: snapshot\ndata: ${JSON.stringify(initial)}\n\n`);
    }
  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: (err as Error).message })}\n\n`);
  }

  while (!closed && Date.now() - started < HOLD_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    if (closed) break;
    try {
      const snap = await buildPayload(trackId);
      if (!snap) continue;
      const h = hashPayload(snap);
      if (h === lastHash) {
        // Heartbeat so proxies don't drop the idle connection.
        res.write(`: keepalive ${Date.now()}\n\n`);
        continue;
      }
      lastHash = h;
      res.write(`event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`);
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: (err as Error).message })}\n\n`);
    }
  }

  res.end();
}
