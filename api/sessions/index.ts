import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchUserEmail, isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { getProjectMembership } from "../_lib/projects-db.js";
import {
  createLiveSession,
  endLiveSession,
  getActiveSessionForProject,
  upsertParticipant,
} from "../_lib/sessions-db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;

  if (req.method === "GET") {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : null;
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    const membership = await getProjectMembership(projectId, userId);
    if (!membership) return res.status(403).json({ error: "Not a member" });
    const session = await getActiveSessionForProject(projectId);
    return res.status(200).json({ session });
  }

  if (req.method === "POST") {
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as {
      projectId?: string;
      externalTrackId?: string;
    };
    if (!body.projectId) return res.status(400).json({ error: "projectId required" });
    const membership = await getProjectMembership(body.projectId, userId);
    if (!membership || membership.role !== "producer") {
      return res.status(403).json({ error: "Only producer can start a live session" });
    }
    const session = await createLiveSession({
      projectId: body.projectId,
      externalTrackId: body.externalTrackId ?? null,
      startedByUserId: userId,
    });
    if (!session) return res.status(503).json({ error: "Database not available" });
    const email = await fetchUserEmail(userId);
    await upsertParticipant({
      sessionId: session.id,
      userId,
      displayName: email,
      projectRole: membership.role,
    });
    return res.status(200).json({ session });
  }

  if (req.method === "DELETE") {
    const sessionId = typeof req.query.id === "string" ? req.query.id : null;
    if (!sessionId) return res.status(400).json({ error: "id required" });
    const ok = await endLiveSession({ sessionId, userId });
    return res.status(ok ? 200 : 403).json({ ok });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
