import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getTakeWithAnalysis } from "../../_lib/takes-db.js";
import { isB2Configured, presignDownload, takeObjectKey } from "../../_lib/b2-storage.js";

// Avspillings-proxy for B2: GET /api/takes/:id/audio[?kind=memo] → 302 til en
// fersk presignert B2 GET-URL. kind=take (standard) = hoved-take; kind=memo =
// produsent-memo. Holder storage_url/producer_memo_url stabile for alle
// avspillings-steder uten å endre dem. Take-id er ugjettbart (base64url(12)).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isB2Configured()) {
    return res.status(503).json({ error: "B2 storage is not configured." });
  }
  const id = String(req.query.id || "");
  if (!id) return res.status(400).json({ error: "id required" });
  const kind = String(req.query.kind || "take");

  try {
    let key: string;
    if (kind === "memo") {
      key = `easeverse/memos/${id}/memo`;
    } else {
      const take = await getTakeWithAnalysis(id);
      if (!take) return res.status(404).json({ error: "Take not found" });
      key = takeObjectKey(id, take.filename);
    }
    const url = await presignDownload(key);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.redirect(302, url);
  } catch (error) {
    console.error("[takes/:id/audio] error:", error);
    return res.status(500).json({ error: "Could not resolve audio" });
  }
}
