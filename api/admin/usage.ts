import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { summarizePerUser } from "../_lib/usage-db.js";
import { getUser, listUsers } from "../_lib/users-db.js";

const DAY_MS = 24 * 60 * 60 * 1000;

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

  const window = (typeof req.query.window === "string" ? req.query.window : "day").toLowerCase();
  const windowMs = window === "month" ? 30 * DAY_MS : window === "week" ? 7 * DAY_MS : DAY_MS;

  const [perUser, users] = await Promise.all([summarizePerUser(windowMs), listUsers()]);
  const emailById = new Map(users.map((u) => [u.userId, u.email]));
  const statusById = new Map(users.map((u) => [u.userId, u.status]));

  const enriched = perUser.map((row) => ({
    ...row,
    email: row.userId ? emailById.get(row.userId) ?? null : null,
    status: row.userId ? statusById.get(row.userId) ?? null : null,
  }));

  return res.status(200).json({ window, perUser: enriched });
}
