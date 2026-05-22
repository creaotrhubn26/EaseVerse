import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { getProjectMembership } from "../_lib/projects-db.js";
import { getLiveSession, postSignal, type SignalType } from "../_lib/sessions-db.js";

const ALLOWED: SignalType[] = ["offer", "answer", "ice", "bye"];

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
  const membership = await getProjectMembership(session.projectId, userId);
  if (!membership) return res.status(403).json({ error: "Not a project member" });

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as {
    toUserId?: string;
    signalType?: SignalType;
    payload?: unknown;
  };
  if (!body.toUserId || !body.signalType || !ALLOWED.includes(body.signalType)) {
    return res.status(400).json({ error: "toUserId + valid signalType required" });
  }
  await postSignal({
    sessionId,
    fromUserId: userId,
    toUserId: body.toUserId,
    signalType: body.signalType,
    payload: body.payload ?? null,
  });
  return res.status(200).json({ ok: true });
}
