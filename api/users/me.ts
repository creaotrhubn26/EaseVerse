import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchUserEmail, isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { getUser, recordUserSeen } from "../_lib/users-db.js";
import { applyPendingInvitesForEmail } from "../_lib/projects-db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  let user = await getUser(userId);
  const isFirstSeen = !user;
  let email: string | null = user?.email ?? null;
  if (!user) {
    email = await fetchUserEmail(userId);
    user = await recordUserSeen({ userId, email });
  }

  if (!user) {
    return res.status(503).json({ error: "Database not available." });
  }

  if (isFirstSeen && email) {
    try {
      const applied = await applyPendingInvitesForEmail({ userId, email });
      if (applied > 0) console.log("[users/me] applied", applied, "pending project invites for", email);
    } catch (err) {
      console.warn("applyPendingInvitesForEmail failed:", err);
    }
  }

  return res.status(200).json(user);
}
