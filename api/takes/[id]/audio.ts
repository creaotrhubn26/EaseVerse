import { soundRoomContext, soundRoomStorage } from '../../_lib/creatorhub-storage.js';
import { requireAuth } from "../../_lib/auth.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getTakeWithAnalysis } from "../../_lib/takes-db.js";
import { isB2Configured, presignDownload, takeObjectKey } from "../../_lib/b2-storage.js";

// New takes resolve private CreatorHub S3 only after session and project checks.
// Legacy random-ID takes/memos keep their existing read-only B2 compatibility.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
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
      if (/^[a-f0-9-]{36}$/i.test(id)) {
        const userId = await requireAuth(req, res); if (!userId) return;
        const context = await soundRoomContext(take.projectId, userId, true);
        if (!context) return res.status(404).json({ error: 'Project not found' });
        const playback = await soundRoomStorage(`${id}/playback`, context);
        if (typeof playback.url !== 'string' || !playback.url.startsWith('https://')) return res.status(503).json({ error: 'Playback unavailable' });
        res.setHeader('Cache-Control', 'private, no-store');
        if (req.query.format === 'json') return res.status(200).json(playback);
        return res.redirect(302, playback.url);
      }
      key = takeObjectKey(id);
    }
    if (!isB2Configured()) return res.status(503).json({ error: "Legacy audio storage is unavailable." });
    const url = await presignDownload(key);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.redirect(302, url);
  } catch (error) {
    console.error("[takes/:id/audio] error:", error);
    return res.status(500).json({ error: "Could not resolve audio" });
  }
}
