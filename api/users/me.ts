import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchUserEmail, isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { getUser, recordUserSeen } from "../_lib/users-db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  let user = await getUser(userId);
  if (!user) {
    const email = await fetchUserEmail(userId);
    user = await recordUserSeen({ userId, email });
  }

  if (!user) {
    return res.status(503).json({ error: "Database not available." });
  }

  return res.status(200).json(user);
}
