import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "./_lib/auth.js";
import { summarizeUserUsage } from "./_lib/usage-db.js";
import { getUser } from "./_lib/users-db.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  const me = await getUser(userId);
  const isAdmin = me?.status === "admin";

  // Admins can request another user's usage via ?userId=…, otherwise it's self.
  const targetParam = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const target = isAdmin && targetParam ? targetParam : userId;
  const scope = isAdmin && targetParam === "all" ? null : target;

  const day = await summarizeUserUsage(scope, DAY_MS);
  const week = await summarizeUserUsage(scope, 7 * DAY_MS);
  const month = await summarizeUserUsage(scope, 30 * DAY_MS);

  return res.status(200).json({ day, week, month });
}
