import type { VercelRequest, VercelResponse } from "@vercel/node";
import { canSetProjectTempo } from "../_lib/producer-tempo-permissions.js";
import { validBpm } from "../../lib/tempo.js";
import { isAuthConfigured, requireAuth } from "../_lib/auth.js";
import {
  armRecording,
  getLiveSession,
  stopRecording,
  updateSessionBpm,
} from "../_lib/sessions-db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const sessionId = typeof req.query.id === "string" ? req.query.id : null;
  if (!sessionId) return res.status(400).json({ error: "id required" });
  const session = await getLiveSession(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.startedByUserId !== userId) {
    return res.status(403).json({ error: "Only the producer can arm or stop recording" });
  }

  if ((req.method === "POST" || req.method === "PATCH") && !await canSetProjectTempo(session.projectId, userId)) {
    return res.status(403).json({ error: "Only the project producer can set the tempo or arm recording" });
  }

  if (req.method === "POST") {
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as {
      countdownSec?: number;
      bpm?: number;
      clickOn?: boolean;
    };
    const countdownSec = Math.max(0, Math.min(15, body.countdownSec ?? 4));
    if (body.bpm !== undefined && validBpm(body.bpm) === null) {
      return res.status(400).json({ error: "bpm must be between 20 and 400" });
    }
    const updated = await armRecording({
      sessionId,
      userId,
      countdownSec,
      bpm: typeof body.bpm === "number" ? body.bpm : undefined,
      clickOn: typeof body.clickOn === "boolean" ? body.clickOn : undefined,
    });
    return res.status(200).json({ session: updated });
  }

  if (req.method === "PATCH") {
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as {
      bpm?: number;
      clickOn?: boolean;
    };
    const bpm = validBpm(body.bpm);
    if (bpm === null) return res.status(400).json({ error: "bpm must be between 20 and 400" });
    await updateSessionBpm({
      sessionId,
      userId,
      bpm,
      clickOn: typeof body.clickOn === "boolean" ? body.clickOn : undefined,
    });
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const updated = await stopRecording({ sessionId, userId });
    return res.status(200).json({ session: updated });
  }

  res.setHeader("Allow", "POST, PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
