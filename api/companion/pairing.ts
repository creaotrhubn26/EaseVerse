import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";

// Pairing tokens are kept in-memory on the function instance. Cold-starts
// reset the set, which is fine for short-lived pairing flows.
const TTL_MS = 15 * 60 * 1000;
const active = new Map<string, number>();

function cleanup(now: number) {
  for (const [token, expiresAt] of active.entries()) {
    if (expiresAt <= now) active.delete(token);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (isClerkConfigured()) {
    const userId = await requireAuth(req, res);
    if (!userId) return;
  }

  const now = Date.now();
  cleanup(now);
  const token = `pair_${crypto.randomBytes(18).toString("base64url")}`;
  const expiresAt = now + TTL_MS;
  active.set(token, expiresAt);

  return res.status(200).json({
    token,
    expiresAt: new Date(expiresAt).toISOString(),
    ttlSeconds: Math.round(TTL_MS / 1000),
    usage: "export EASEVERSE_API_KEY=$TOKEN && npm run companion:dev",
  });
}
