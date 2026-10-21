import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth, getAuthenticatedUser } from "../_lib/auth.js";
import {
  requestSoundRoomInvitation,
  InvitationError,
} from "../_lib/sound-room-invitations.js";
import { acceptSoundRoomProjectInvitation } from "../_lib/creatorhub-project-links.js";

export function createInvitationHandler(
  deps = {
    auth: requireAuth,
    user: getAuthenticatedUser,
    upstream: requestSoundRoomInvitation,
    accept: acceptSoundRoomProjectInvitation,
  }
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "method_not_allowed" });
    }
    const actor = await deps.auth(req, res);
    if (!actor) return;
    const user = deps.user(req);
    if (!user?.email)
      return res.status(401).json({ error: "sign_in_required" });
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const token = body.inviteToken;
    if (typeof token !== "string" || !/^inv_[A-Za-z0-9_-]{16,76}$/.test(token))
      return res.status(400).json({ error: "invalid_invitation" });
    if (!["lookup", "complete"].includes(body.action))
      return res.status(400).json({ error: "invalid_action" });
    try {
      const context = await deps.upstream(
        body.action,
        token,
        actor,
        body.action === "complete" ? body.profile : undefined
      );
      const linked =
        body.action === "complete"
          ? await deps.accept(context, actor, user.email)
          : null;
      // No producer IDs, service keys or other members' information reach the app.
      return res.json({
        projectTitle: context.projectTitle,
        profile: context.profile,
        easeverseAccess: context.easeverseAccess,
        linked,
        completed: body.action === "complete",
      });
    } catch (e) {
      const status = e instanceof InvitationError ? e.status : 503;
      return res
        .status(status === 404 || status === 403 ? 404 : status)
        .json({
          error:
            status === 404 || status === 403
              ? "invitation_unavailable"
              : status === 400
              ? "profile_invalid"
              : "invitation_temporarily_unavailable",
        });
    }
  };
}
export default createInvitationHandler();
