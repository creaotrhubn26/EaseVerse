import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Pool } from "pg";
import { requireExternalKey } from "../../../_lib/collab-store.js";

// Eksponerer aktiv live-opptaksøkt for et eksternt track, slik at CreatorHub
// Audio Showcase kan vise «live i EaseVerse» + opptaksstatus + take-antall.
let pool: Pool | null = null;
function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  return pool;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireExternalKey(req, res)) return;
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const externalTrackId = String(req.query.externalTrackId || "").trim();
  if (!externalTrackId) return res.status(400).json({ error: "externalTrackId required" });
  const p = getPool();
  if (!p) return res.status(200).json({ ok: true, live: false });
  try {
    const { rows } = await p.query(
      `SELECT id, started_at, bpm, click_on, recording_armed_at, recording_starts_at, recording_stopped_at, mixdown_url, mixdown_status
         FROM live_sessions WHERE external_track_id = $1 AND status = 'active'
        ORDER BY started_at DESC LIMIT 1`, [externalTrackId]);
    const s = rows[0];
    if (!s) return res.status(200).json({ ok: true, live: false });
    const cnt = await p.query(`SELECT COUNT(*)::int AS n FROM takes WHERE live_session_id = $1`, [s.id]);
    const recording = !!s.recording_starts_at && !s.recording_stopped_at;
    return res.status(200).json({
      ok: true, live: true,
      session: {
        id: String(s.id), startedAt: s.started_at, bpm: s.bpm ?? null, clickOn: !!s.click_on,
        recording, armed: !!s.recording_armed_at && !recording, takeCount: cnt.rows[0]?.n ?? 0,
        mixdownUrl: s.mixdown_url ?? null, mixdownStatus: s.mixdown_status ?? null,
      },
    });
  } catch (e) {
    console.error("collab live-session error:", e);
    return res.status(500).json({ error: "Failed to load live session" });
  }
}
