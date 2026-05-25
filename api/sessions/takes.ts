import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { getProjectMembership } from "../_lib/projects-db.js";
import { getLiveSession, listParticipants } from "../_lib/sessions-db.js";
import { listTakesForLiveSession } from "../_lib/takes-db.js";

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

  const sessionId = typeof req.query.id === "string" ? req.query.id : null;
  if (!sessionId) return res.status(400).json({ error: "id required" });

  const session = await getLiveSession(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  const membership = await getProjectMembership(session.projectId, userId);
  if (!membership) return res.status(403).json({ error: "Not a project member" });

  const [takes, participants] = await Promise.all([
    listTakesForLiveSession(sessionId),
    listParticipants(sessionId),
  ]);
  const byUser = new Map(participants.map((p) => [p.userId, p]));
  const recordingStartsAt = session.recordingStartsAt
    ? new Date(session.recordingStartsAt).getTime()
    : null;

  const rows = takes.map((t) => {
    const p = byUser.get(t.userId);
    const uploadedMs = new Date(t.uploadedAt).getTime();
    const offsetSec =
      recordingStartsAt && t.durationSec
        ? Math.max(0, (uploadedMs - t.durationSec * 1000 - recordingStartsAt) / 1000)
        : 0;
    return {
      takeId: t.id,
      userId: t.userId,
      displayName: p?.displayName ?? null,
      projectRole: p?.projectRole ?? null,
      storageUrl: t.storageUrl,
      filename: t.filename,
      durationSec: t.durationSec,
      uploadedAt: t.uploadedAt,
      offsetSec,
      status: t.status,
    };
  });

  return res.status(200).json({
    session: {
      id: session.id,
      externalTrackId: session.externalTrackId,
      bpm: session.bpm,
      recordingStartsAt: session.recordingStartsAt,
      recordingStoppedAt: session.recordingStoppedAt,
      endedAt: session.endedAt,
      startedAt: session.startedAt,
    },
    takes: rows,
  });
}
