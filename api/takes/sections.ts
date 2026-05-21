import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { getTakeById, getTakeWithAnalysis } from "../_lib/takes-db.js";
import { detectSections } from "../../lib/match-lyrics-sections.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const takeId = typeof req.query.id === "string" ? req.query.id : null;
  if (!takeId) return res.status(400).json({ error: "id query param required" });

  const take = await getTakeById(takeId);
  if (!take) return res.status(404).json({ error: "Take not found" });
  const detail = await getTakeWithAnalysis(takeId);
  const words = detail?.analysis?.transcriptWords ?? [];
  const lyrics = take.lyricsSnapshot;

  const sections = detectSections({ lyrics, words });
  return res.status(200).json({ takeId, sections, wordCount: words.length });
}
