import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Pool } from "pg";

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
      transcript: string | null;
      ai_notes: string | null;
      pitch_mean_hz: number | null;
      energy_avg_db: number | null;
    }>(
      `SELECT t.id, t.filename, t.uploaded_at, t.duration_sec, t.status, t.storage_url,
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

    return res.status(200).json({
      trackId: trackIdQuery,
      lyrics,
      takes: takeRows.map((t) => ({
        id: t.id,
        filename: t.filename,
        uploadedAt: t.uploaded_at,
        durationSec: t.duration_sec,
        status: t.status,
        audioUrl: t.storage_url,
        transcript: t.transcript,
        aiNotes: t.ai_notes,
        pitchMeanHz: t.pitch_mean_hz,
        energyAvgDb: t.energy_avg_db,
      })),
    });
  } catch (error) {
    console.error("Booth fetch failed:", error);
    return res.status(500).json({ error: "Booth fetch failed" });
  }
}
