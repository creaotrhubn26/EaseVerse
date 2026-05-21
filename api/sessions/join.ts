import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchUserEmail, isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { getProjectMembership } from "../_lib/projects-db.js";
import {
  getLiveSession,
  leaveParticipant,
  recordHeartbeat,
  upsertParticipant,
} from "../_lib/sessions-db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  if (req.method === "POST") {
    const email = await fetchUserEmail(userId);
    await upsertParticipant({
      sessionId,
      userId,
      displayName: email,
      projectRole: membership.role,
    });
    return res.status(200).json({ ok: true });
  }

  if (req.method === "PATCH") {
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as {
      micArmed?: boolean;
      recording?: boolean;
    };
    await recordHeartbeat({
      sessionId,
      userId,
      micArmed: typeof body.micArmed === "boolean" ? body.micArmed : undefined,
      recording: typeof body.recording === "boolean" ? body.recording : undefined,
    });
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    await leaveParticipant({ sessionId, userId });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "POST, PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
