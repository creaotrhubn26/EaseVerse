import type { VercelRequest, VercelResponse } from "@vercel/node";
import { processCreatorHubSyncOutbox } from "../_lib/creatorhub-sync-outbox.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const expected = process.env.CRON_SECRET;
  const authorization = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization;
  if (!expected || authorization !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return res.status(200).json(await processCreatorHubSyncOutbox(25));
}
