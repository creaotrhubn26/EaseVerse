import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Pool } from "pg";
import { requireExternalKey } from "../../../_lib/collab-store.js";

// Eksponerer ord-nivå timing fra siste analyserte take for et eksternt track,
// slik at CreatorHub Audio Showcase kan lage beat-synket karaoke automatisk
// (uten manuell tap-to-time). transcript_words: [{ word, start, end }].
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
  if (!p) return res.status(200).json({ ok: true, hasTiming: false, words: [], lyrics: null });
  try {
    const { rows } = await p.query(
      `SELECT a.transcript_words, t.lyrics_snapshot, t.id AS take_id, t.uploaded_at
         FROM takes t JOIN take_analyses a ON a.take_id = t.id
        WHERE t.external_track_id = $1 AND a.transcript_words IS NOT NULL
        ORDER BY t.uploaded_at DESC LIMIT 1`,
      [externalTrackId],
    );
    const row = rows[0];
    const words = Array.isArray(row?.transcript_words) ? row.transcript_words : [];
    return res.status(200).json({ ok: true, hasTiming: words.length > 0, words, lyrics: row?.lyrics_snapshot ?? null, takeId: row?.take_id ?? null });
  } catch (e) {
    console.error("collab take-timing error:", e);
    return res.status(500).json({ error: "Failed to load take timing" });
  }
}
