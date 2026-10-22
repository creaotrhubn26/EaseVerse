import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchUserEmail, isAuthConfigured, requireAuth } from "../_lib/auth.js";
import { getUser, recordUserSeen } from "../_lib/users-db.js";
import { applyPendingInvitesForEmail } from "../_lib/projects-db.js";
import { getInvitedStudioProjects } from "../_lib/creatorhub-project-links.js";

export function createCurrentUserHandler(deps = {
  configured: isAuthConfigured, auth: requireAuth, email: fetchUserEmail,
  get: getUser, record: recordUserSeen, reconcile: applyPendingInvitesForEmail,
  studioProjects: getInvitedStudioProjects,
}) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    if (!deps.configured()) return res.status(503).json({ error: "Auth is not configured." });
    const userId = await deps.auth(req, res);
    if (!userId) return;
    try {
      let user = await deps.get(userId);
      const email = await deps.email(userId);
      if (!user) user = await deps.record({ userId, email });
      if (!user) return res.status(503).json({ error: "Database not available." });
      // An invitation never reactivates a banned account or changes prototype status.
      if (user.status === "banned") return res.json({ ...user, studioAccess: { projectIds: [] } });
      // Existing identities can also receive a later producer invitation.
      if (email) await deps.reconcile({ userId, email });
      const projectIds = await deps.studioProjects(userId);
      return res.json({ ...user, studioAccess: { projectIds } });
    } catch {
      return res.status(503).json({ error: "Could not verify account access. Please retry." });
    }
  };
}
export default createCurrentUserHandler();
