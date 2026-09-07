import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthenticatedUser, requireAuth } from "../_lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;
  return res.status(200).json({ authenticated: true, user: getAuthenticatedUser(req) });
}
