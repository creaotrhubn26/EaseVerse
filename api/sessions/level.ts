import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { getProjectMembership } from "../_lib/projects-db.js";
import { getLiveSession, updateParticipantLevel } from "../_lib/sessions-db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const sessionId = typeof req.query.id === "string" ? req.query.id : null;
  if (!sessionId) return res.status(400).json({ error: "id required" });
  const session = await getLiveSession(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  const m = await getProjectMembership(session.projectId, userId);
  if (!m) return res.status(403).json({ error: "Not a member" });

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as {
    levelDb?: number;
    peakDb?: number;
    waveformPeaks?: number[];
  };
  if (typeof body.levelDb !== "number" || typeof body.peakDb !== "number") {
    return res.status(400).json({ error: "levelDb + peakDb required" });
  }
  await updateParticipantLevel({
    sessionId,
    userId,
    levelDb: Math.max(-90, Math.min(0, body.levelDb)),
    peakDb: Math.max(-90, Math.min(6, body.peakDb)),
    waveformPeaks: Array.isArray(body.waveformPeaks) ? body.waveformPeaks.slice(-200) : [],
  });
  return res.status(200).json({ ok: true });
}
