import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import {
  castConsensusVote,
  clearConsensusVote,
  getConsensusTally,
  getTakeById,
} from "../_lib/takes-db.js";
import { getProjectMembership } from "../_lib/projects-db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const takeId = typeof req.query.id === "string" ? req.query.id : null;
  if (!takeId) return res.status(400).json({ error: "id query param required" });

  const take = await getTakeById(takeId);
  if (!take) return res.status(404).json({ error: "Take not found" });

  if (take.projectId) {
    const membership = await getProjectMembership(take.projectId, userId);
    if (!membership) return res.status(403).json({ error: "Not a member of this project" });
    if (req.method !== "GET" && membership.role === "observer") {
      return res.status(403).json({ error: "Observers can't vote" });
    }
    if (req.method !== "GET" && membership.role === "producer") {
      return res.status(400).json({ error: "Producer owns the decision and doesn't vote" });
    }
  } else if (take.userId !== userId && req.method !== "GET") {
    return res.status(403).json({ error: "This take has no project — only the owner can interact" });
  }

  if (req.method === "GET") {
    const tally = await getConsensusTally(takeId, userId);
    return res.status(200).json(tally);
  }

  if (req.method === "POST" || req.method === "PATCH") {
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as {
      vote?: string;
      comment?: string;
    };
    if (body.vote !== "agree" && body.vote !== "disagree") {
      return res.status(400).json({ error: "vote must be 'agree' or 'disagree'" });
    }
    const comment =
      typeof body.comment === "string" ? body.comment.slice(0, 500).trim() || null : null;
    if (body.vote === "disagree" && !comment) {
      return res.status(400).json({ error: "Disagree requires a short comment" });
    }
    const tally = await castConsensusVote({
      takeId,
      userId,
      vote: body.vote,
      comment,
    });
    return res.status(200).json(tally);
  }

  if (req.method === "DELETE") {
    const tally = await clearConsensusVote({ takeId, userId });
    return res.status(200).json(tally);
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
