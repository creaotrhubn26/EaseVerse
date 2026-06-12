import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireExternalKey, parseBody, upsertProTools, listProTools, type ProToolsRecord } from "../../../_lib/collab-store.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireExternalKey(req, res)) return;

  if (req.method === "GET") {
    try {
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId.trim() : undefined;
      const source = typeof req.query.source === "string" ? req.query.source.trim() : undefined;
      const externalTrackId = typeof req.query.externalTrackId === "string" ? req.query.externalTrackId.trim() : undefined;
      const { records, storage } = await listProTools({ projectId, source, externalTrackId });
      return res.status(200).json({ ok: true, storage, count: records.length, items: records });
    } catch (e) {
      console.error("collab protools list error:", e);
      return res.status(500).json({ error: "Failed to list Pro Tools sync payloads" });
    }
  }

  if (req.method === "POST") {
    try {
      const b = parseBody(req);
      const externalTrackId = String(b?.externalTrackId || "").trim();
      if (!externalTrackId) return res.status(400).json({ error: "Invalid request body: externalTrackId is required" });
      const now = new Date().toISOString();
      const rec: ProToolsRecord = {
        externalTrackId: externalTrackId.slice(0, 160),
        projectId: (b?.projectId ? String(b.projectId) : "__default__").slice(0, 160),
        source: (b?.source ? String(b.source) : "protools-companion").slice(0, 120),
        bpm: Number.isFinite(Number(b?.bpm)) ? Math.round(Number(b.bpm)) : undefined,
        markers: Array.isArray(b?.markers) ? b.markers : [],
        takeScores: Array.isArray(b?.takeScores) ? b.takeScores : [],
        pronunciationFeedback: Array.isArray(b?.pronunciationFeedback) ? b.pronunciationFeedback : [],
        updatedAt: typeof b?.updatedAt === "string" ? b.updatedAt : now,
        receivedAt: now,
      };
      const { record, storage } = await upsertProTools(rec);
      return res.status(200).json({ ok: true, storage, item: record });
    } catch (e) {
      console.error("collab protools upsert error:", e);
      return res.status(500).json({ error: "Failed to upsert Pro Tools sync payload" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
