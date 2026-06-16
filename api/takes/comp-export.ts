import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth, requireAuthOrPairing } from "../_lib/auth.js";
import { getComp, markCompDelivered, markCompExported } from "../_lib/takes-db.js";
import { getProjectMembership } from "../_lib/projects-db.js";
import { isB2Configured, presignUpload, presignDownload } from "../_lib/b2-storage.js";

const compKey = (compId: string, filename: string) =>
  `easeverse/comps/${compId}/${(filename || "export.wav").replace(/[^A-Za-z0-9._-]/g, "_").slice(-120)}`;

// Comp-eksport til Backblaze B2 (samme sted som takes — ikke Vercel Blob).
//  GET   ?id=<compId>      → 302 til presignert B2 GET (nedlasting/avspilling)
//  PATCH ?id=<compId>      → companion bekrefter levering
//  POST  {compId,filename,action:'init'}      → presignert PUT
//  POST  {compId,filename,action:'finalize'}  → markCompExported(url=proxy)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isClerkConfigured()) return res.status(503).json({ error: "Auth is not configured." });

  // GET = nedlastings-proxy (presignert B2 GET).
  if (req.method === "GET") {
    if (!isB2Configured()) return res.status(503).json({ error: "B2 storage is not configured." });
    const compId = typeof req.query.id === "string" ? req.query.id : null;
    if (!compId) return res.status(400).json({ error: "id query param required" });
    const comp = await getComp(compId);
    if (!comp || !comp.exportedFilename) return res.status(404).json({ error: "Comp export not found" });
    const url = await presignDownload(compKey(compId, comp.exportedFilename));
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.redirect(302, url);
  }

  // PATCH = companion acknowledges it picked up the export and wrote it to disk.
  if (req.method === "PATCH") {
    const userId = await requireAuthOrPairing(req, res);
    if (!userId) return;
    const compId = typeof req.query.id === "string" ? req.query.id : null;
    if (!compId) return res.status(400).json({ error: "id query param required" });
    const comp = await getComp(compId);
    if (!comp || comp.createdByUserId !== userId) {
      return res.status(403).json({ error: "Not your comp" });
    }
    await markCompDelivered(compId);
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isB2Configured()) return res.status(503).json({ error: "B2 storage is not configured." });

  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    const b = ((typeof req.body === "object" && req.body) || {}) as Record<string, unknown>;
    const compId = String(b.compId || "");
    if (!compId) return res.status(400).json({ error: "compId required" });
    const filename = String(b.filename || `${compId}.wav`);

    const comp = await getComp(compId);
    if (!comp) return res.status(404).json({ error: "Comp not found" });
    if (comp.projectId) {
      const m = await getProjectMembership(comp.projectId, userId);
      if (!m || m.role === "observer") return res.status(403).json({ error: "Observers can't export comps" });
    } else if (comp.createdByUserId !== userId) {
      return res.status(403).json({ error: "Not your comp" });
    }

    if (b.action === "finalize") {
      const host = String(req.headers["x-forwarded-host"] || req.headers.host || "easeverse.vercel.app");
      const proto = String(req.headers["x-forwarded-proto"] || "https");
      await markCompExported({
        compId,
        url: `${proto}://${host}/api/takes/comp-export?id=${encodeURIComponent(compId)}`,
        filename,
      });
      return res.status(200).json({ ok: true });
    }

    const uploadUrl = await presignUpload(compKey(compId, filename), "audio/wav");
    return res.status(200).json({ uploadUrl, key: compKey(compId, filename) });
  } catch (error) {
    console.error("[comp-export] error:", error);
    return res.status(500).json({ error: (error as Error).message || "Comp export failed" });
  }
}
