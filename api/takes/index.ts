import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { listTakesForUser, getTakeWithAnalysis } from "../_lib/takes-db.js";

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

  const idQuery = req.query.id;
  if (typeof idQuery === "string") {
    const take = await getTakeWithAnalysis(idQuery);
    if (!take || take.userId !== userId) {
      return res.status(404).json({ error: "Not found" });
    }
    return res.status(200).json(take);
  }

  const limit = typeof req.query.limit === "string"
    ? Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50))
    : 50;
  const takes = await listTakesForUser(userId, limit);
  return res.status(200).json({ takes });
}
