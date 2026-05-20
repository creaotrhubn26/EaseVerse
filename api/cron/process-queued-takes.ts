import type { VercelRequest, VercelResponse } from "@vercel/node";
import { listQueuedTakes } from "../_lib/takes-db.js";
import { processTake } from "../_lib/take-processor.js";

export const config = { maxDuration: 60 };

const MAX_PER_RUN = 5;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (token !== expected) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const queued = await listQueuedTakes(MAX_PER_RUN);
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const take of queued) {
    try {
      await processTake(take);
      results.push({ id: take.id, ok: true });
    } catch (err) {
      results.push({ id: take.id, ok: false, error: (err as Error).message });
    }
  }

  return res.status(200).json({
    pickedUp: queued.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
