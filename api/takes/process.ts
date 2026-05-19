import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { getTakeWithAnalysis } from "../_lib/takes-db.js";
import { processTake } from "../_lib/take-processor.js";

export const config = {
  maxDuration: 60,
};

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

  const idQuery = req.query.id;
  if (typeof idQuery !== "string") {
    return res.status(400).json({ error: "id query param required" });
  }

  const take = await getTakeWithAnalysis(idQuery);
  if (!take || take.userId !== userId) {
    return res.status(404).json({ error: "Not found" });
  }
  if (take.status === "processing" || take.status === "done") {
    return res.status(200).json({ status: take.status });
  }

  await processTake(take);
  const updated = await getTakeWithAnalysis(idQuery);
  return res.status(200).json(updated);
}
