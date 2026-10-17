import { ensureCreatorHubProjectLinksSchema } from "../../../_lib/creatorhub-project-links.js";
import { ensureTakesSchema } from "../../../_lib/takes-db.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireExternalKey, getKeeperTakes } from "../../../_lib/collab-store.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireExternalKey(req, res)) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const externalTrackId = String(req.query.externalTrackId || "").trim();
    if (!externalTrackId) return res.status(400).json({ error: "externalTrackId required" });
    const ownerUserId = typeof req.query.ownerUserId === 'string' ? req.query.ownerUserId.trim() : '';
    if (!ownerUserId) return res.status(400).json({ error: 'ownerUserId required' });
    await ensureTakesSchema(); await ensureCreatorHubProjectLinksSchema();
    const { takes, storage } = await getKeeperTakes(externalTrackId, ownerUserId);
    if (storage === 'error') return res.status(503).json({ error: 'Could not load takes' });
    return res.status(200).json({ ok: true, storage, count: takes.length, items: takes });
  } catch (e) {
    console.error("collab takes get error:", e);
    return res.status(500).json({ error: "Failed to fetch takes" });
  }
}
