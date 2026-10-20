import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Pool } from "pg";
import { coachingEvidence } from "../../../_lib/coaching-evidence.js";
import { requireExternalKey } from "../../../_lib/collab-store.js";

// Expose documented PCM level statistics, never historic AI performance scores.
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
  if (!p) return res.status(200).json({ ok: true, count: 0, items: [] });
  try {
    const { rows } = await p.query(
      `SELECT t.id, t.filename, t.producer_decision, t.uploaded_at,
              a.energy_avg_db, a.energy_stddev_db, a.processed_at
         FROM takes t JOIN take_analyses a ON a.take_id = t.id
        WHERE t.external_track_id = $1
        ORDER BY t.uploaded_at DESC LIMIT 50`,
      [externalTrackId],
    );
    const items = rows.map(coachingEvidence);
    return res.status(200).json({ ok: true, count: items.length, items });
  } catch (e) {
    console.error("collab coaching error:", e);
    return res.status(500).json({ error: "Failed to load coaching" });
  }
}
