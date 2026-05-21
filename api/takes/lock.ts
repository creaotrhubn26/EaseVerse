import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { getTakeById, lockTakeDecision, unlockTakeDecision } from "../_lib/takes-db.js";
import { getProjectMembership } from "../_lib/projects-db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    res.setHeader("Allow", "POST, DELETE");
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

  let producerUserId = take.userId;
  if (take.projectId) {
    const membership = await getProjectMembership(take.projectId, userId);
    if (!membership || membership.role !== "producer") {
      return res.status(403).json({ error: "Only the producer can lock decisions" });
    }
    producerUserId = userId;
  } else if (take.userId !== userId) {
    return res.status(403).json({ error: "Only the take owner can lock" });
  }

  const updated =
    req.method === "POST"
      ? await lockTakeDecision({ takeId, userId: producerUserId })
      : await unlockTakeDecision({ takeId, userId: producerUserId });
  if (!updated) return res.status(404).json({ error: "Take not found or not yours" });
  return res.status(200).json(updated);
}
