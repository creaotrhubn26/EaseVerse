import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Pool } from "pg";
import { requireExternalKey } from "../../../_lib/collab-store.js";

// Eksponerer vokal-coachens vurdering per take (timing/uttale-score + AI-notater +
// beste-take-flagg) for et eksternt track, slik at CreatorHub Audio Showcase kan
// vise coach-tilbakemeldingen i review-rommet.
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
              a.timing_score, a.pronunciation_score, a.ai_notes, a.best_take_in_group, a.processed_at
         FROM takes t JOIN take_analyses a ON a.take_id = t.id
        WHERE t.external_track_id = $1
        ORDER BY a.best_take_in_group DESC NULLS LAST, t.uploaded_at DESC LIMIT 50`,
      [externalTrackId],
    );
    const items = rows.map((r) => ({
      takeId: String(r.id), filename: r.filename || "take.wav", decision: r.producer_decision || null,
      timingScore: r.timing_score ?? null, pronunciationScore: r.pronunciation_score ?? null,
      aiNotes: r.ai_notes ?? null, bestInGroup: !!r.best_take_in_group, processedAt: r.processed_at || null,
    }));
    return res.status(200).json({ ok: true, count: items.length, items });
  } catch (e) {
    console.error("collab coaching error:", e);
    return res.status(500).json({ error: "Failed to load coaching" });
  }
}
