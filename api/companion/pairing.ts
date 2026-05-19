import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { createPairingToken } from "../_lib/pairing-db.js";

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

  const record = await createPairingToken(userId);

  return res.status(200).json({
    token: record.token,
    expiresAt: record.expiresAt,
    ttlSeconds: Math.round((Date.parse(record.expiresAt) - Date.parse(record.createdAt)) / 1000),
    usage: "export EASEVERSE_PAIR_TOKEN=$TOKEN && npm run companion:dev",
  });
}
