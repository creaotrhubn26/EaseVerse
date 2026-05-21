import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Pool } from "pg";
import { listRegionsForTakes, ensureTakesSchema } from "./_lib/takes-db.js";
import { getProjectReferenceTrack } from "./_lib/projects-db.js";

let pool: Pool | null = null;
function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return pool;
}

// Public read-only view of a track's lyrics + recent takes (no auth required).
// Producer shares /booth/[trackId] URL with vocalist; vocalist sees synced state.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const p = getPool();
  if (!p) return res.status(503).json({ error: "Database not available" });

  const trackIdQuery = req.query.trackId;
  if (typeof trackIdQuery !== "string" || !trackIdQuery) {
    return res.status(400).json({ error: "trackId required" });
  }

  try {
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
       ORDER BY updated_at DESC
       LIMIT 1`,
      [trackIdQuery],
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
       ORDER BY t.uploaded_at DESC
       LIMIT 20`,
      [trackIdQuery],
    );

    const lyrics = lyricsRows[0]
      ? {
          title: lyricsRows[0].title,
          lyrics: lyricsRows[0].lyrics,
          bpm: lyricsRows[0].bpm,
          updatedAt: lyricsRows[0].updated_at,
        }
      : null;

    const regionMap = await listRegionsForTakes(takeRows.map((t) => t.id));

    // Reference track from the first take that has a project_id.
    let referenceTrack: { url: string; name: string | null; durationSec: number | null } | null = null;
    const firstProjectTake = takeRows.find((t) => t.project_id);
    if (firstProjectTake?.project_id) {
      const ref = await getProjectReferenceTrack(firstProjectTake.project_id);
      if (ref?.url) {
        referenceTrack = { url: ref.url, name: ref.name, durationSec: ref.durationSec };
      }
    }

    return res.status(200).json({
      trackId: trackIdQuery,
      lyrics,
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
          t.producer_decision === "keeper" || t.producer_decision === "redo"
            ? t.producer_decision
            : null,
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
    });
  } catch (error) {
    console.error("Booth fetch failed:", error);
    const msg = (error as Error)?.message || String(error);
    return res.status(500).json({ error: "Booth fetch failed", detail: msg.slice(0, 300) });
  }
}
