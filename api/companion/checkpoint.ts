import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuthOrPairing } from "../_lib/auth.js";
import { recordSessionCheckpoint } from "../_lib/takes-db.js";
import { getProjectMembership } from "../_lib/projects-db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }
  const userId = await requireAuthOrPairing(req, res);
  if (!userId) return;

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as {
    projectId?: string;
    externalTrackId?: string;
    source?: string;
    payload?: unknown;
  };

  if (!body.payload) return res.status(400).json({ error: "payload required" });

  if (body.projectId) {
    const m = await getProjectMembership(body.projectId, userId);
    if (!m) return res.status(403).json({ error: "Not a member of this project" });
  }

  const result = await recordSessionCheckpoint({
    userId,
    projectId: body.projectId ?? null,
    externalTrackId: body.externalTrackId ?? null,
    source: body.source || "protools-session-info",
    payload: body.payload,
  });

  if (!result) return res.status(503).json({ error: "Database not available" });
  return res.status(200).json(result);
}
