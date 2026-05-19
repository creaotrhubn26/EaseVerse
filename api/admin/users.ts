import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { getUser, listUsers, setUserStatus, type UserStatus } from "../_lib/users-db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  const me = await getUser(userId);
  if (!me || me.status !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }

  if (req.method === "GET") {
    const users = await listUsers();
    return res.status(200).json({ users });
  }

  if (req.method === "POST") {
    const body = req.body as {
      targetUserId?: string;
      status?: UserStatus;
      pilotDays?: number | null;
      pilotExpiresAt?: string | null;
    } | undefined;
    if (!body?.targetUserId || !body.status) {
      return res.status(400).json({ error: "targetUserId and status required" });
    }
    if (!["pending", "approved", "admin", "banned"].includes(body.status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    let pilotExpiresAt: string | null | undefined = undefined;
    if (body.pilotDays !== undefined) {
      if (body.pilotDays === null || body.pilotDays === 0) {
        pilotExpiresAt = null;
      } else if (Number.isFinite(body.pilotDays) && body.pilotDays > 0 && body.pilotDays <= 365) {
        pilotExpiresAt = new Date(Date.now() + body.pilotDays * 24 * 60 * 60 * 1000).toISOString();
      } else {
        return res.status(400).json({ error: "pilotDays must be 1-365 or 0/null to clear" });
      }
    } else if (body.pilotExpiresAt !== undefined) {
      pilotExpiresAt = body.pilotExpiresAt;
    }
    await setUserStatus({
      targetUserId: body.targetUserId,
      status: body.status,
      actingUserId: userId,
      pilotExpiresAt,
    });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
