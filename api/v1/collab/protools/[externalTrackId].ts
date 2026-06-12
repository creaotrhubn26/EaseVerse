import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireExternalKey, getProTools } from "../../../_lib/collab-store.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireExternalKey(req, res)) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const externalTrackId = String(req.query.externalTrackId || "").trim();
    if (!externalTrackId) return res.status(400).json({ error: "externalTrackId required" });
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId.trim() : undefined;
    const { record, storage } = await getProTools(externalTrackId, projectId);
    if (!record) return res.status(404).json({ error: "Pro Tools sync payload not found" });
    return res.status(200).json({ ok: true, storage, item: record });
  } catch (e) {
    console.error("collab protools get error:", e);
    return res.status(500).json({ error: "Failed to fetch Pro Tools sync payload" });
  }
}
