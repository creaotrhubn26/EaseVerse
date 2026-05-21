import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { deleteSubscription, upsertSubscription } from "../_lib/push-db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) return res.status(503).json({ error: "Push is not configured" });
    return res.status(200).json({ vapidPublicKey: key });
  }

  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (req.method === "POST") {
    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return res.status(400).json({ error: "endpoint + keys required" });
    }
    await upsertSubscription({
      endpoint: body.endpoint,
      userId,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    });
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    if (!body.endpoint) return res.status(400).json({ error: "endpoint required" });
    await deleteSubscription(body.endpoint);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
