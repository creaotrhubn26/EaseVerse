import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireExternalKey, parseBody, upsertLyrics, listLyrics, type CollabLyricsRecord } from "../../../_lib/collab-store.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireExternalKey(req, res)) return;

  if (req.method === "GET") {
    try {
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId.trim() : undefined;
      const source = typeof req.query.source === "string" ? req.query.source.trim() : undefined;
      const { records, storage } = await listLyrics({ projectId, source });
      return res.status(200).json({ ok: true, storage, count: records.length, items: records });
    } catch (e) {
      console.error("collab lyrics list error:", e);
      return res.status(500).json({ error: "Failed to list lyric drafts" });
    }
  }

  if (req.method === "POST") {
    try {
      const b = parseBody(req);
      const externalTrackId = String(b?.externalTrackId || "").trim();
      const title = String(b?.title || "").trim();
      const lyrics = String(b?.lyrics || "").trim();
      if (!externalTrackId || !title || !lyrics) {
        return res.status(400).json({ error: "Invalid request body: externalTrackId, title and lyrics are required" });
      }
      const now = new Date().toISOString();
      const rec: CollabLyricsRecord = {
        externalTrackId: externalTrackId.slice(0, 160),
        projectId: b?.projectId ? String(b.projectId).slice(0, 160) : undefined,
        title: title.slice(0, 240),
        artist: b?.artist ? String(b.artist).slice(0, 160) : undefined,
        bpm: Number.isFinite(Number(b?.bpm)) ? Math.round(Number(b.bpm)) : undefined,
        lyrics: lyrics.slice(0, 20000),
        collaborators: Array.isArray(b?.collaborators) ? b.collaborators.filter((x: unknown) => typeof x === "string").slice(0, 40) : [],
        source: b?.source ? String(b.source).slice(0, 120) : "external",
        updatedAt: typeof b?.updatedAt === "string" ? b.updatedAt : now,
        receivedAt: now,
      };
      const { record, storage } = await upsertLyrics(rec);
      return res.status(200).json({ ok: true, storage, item: record });
    } catch (e) {
      console.error("collab lyrics upsert error:", e);
      return res.status(500).json({ error: "Failed to upsert lyric draft" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
