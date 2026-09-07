import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../../_lib/auth.js";
import { getProTools, requireExternalKey } from "../../../_lib/collab-store.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  let ownerUserId: string | undefined;
  if (req.headers["x-api-key"] !== undefined) {
    if (!requireExternalKey(req, res)) return;
  } else {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    ownerUserId = userId;
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const externalTrackId = String(req.query.externalTrackId || "").trim();
    if (!externalTrackId) return res.status(400).json({ error: "externalTrackId required" });
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId.trim() : undefined;
    const { record, storage } = await getProTools(externalTrackId.slice(0, 160), projectId, ownerUserId);
    if (!record) return res.status(404).json({ error: "Pro Tools sync payload not found" });
    return res.status(200).json({ ok: true, schemaVersion: 1, storage, item: record });
  } catch (error) {
    console.error("collab protools get error:", error);
    return res.status(500).json({ error: "Failed to fetch Pro Tools sync payload" });
  }
}
