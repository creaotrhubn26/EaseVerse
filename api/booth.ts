import { ensureCreatorHubProjectLinksSchema } from "./_lib/creatorhub-project-links.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Pool } from "pg";
import { requireAuth } from "./_lib/auth.js";
import { ensureTakesSchema } from "./_lib/takes-db.js";
import { buildLinkedBoothPayload } from "./_lib/booth-payload.js";
let pool: Pool | null = null;
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  const userId = await requireAuth(req, res); if (!userId) return;
  const trackId = typeof req.query.trackId === 'string' ? req.query.trackId : '';
  if (!trackId) return res.status(400).json({ error: 'trackId required' });
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Database unavailable' });
  try {
    pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
    await ensureTakesSchema();
    await ensureCreatorHubProjectLinksSchema();
    const data = await buildLinkedBoothPayload(pool, userId, trackId, typeof req.query.projectId === 'string' ? req.query.projectId : undefined);
    if (!data) return res.status(404).json({ error: 'Open the song from your linked Sound Room project.' });
    return res.status(200).json(data);
  } catch (error) {
    console.error('[booth] load failed', error);
    return res.status(503).json({ error: 'Could not update the song. Try again.' });
  }
}
