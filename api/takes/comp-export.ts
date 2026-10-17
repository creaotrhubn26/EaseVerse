import uploadAsset from "./asset-upload.js";
import playAsset from "./asset-audio.js";
import { getPublicBase } from "../_lib/public-base.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAuthConfigured, requireAuthOrPairing } from "../_lib/auth.js";
import { getComp, markCompDelivered } from "../_lib/takes-db.js";
import { isB2Configured, presignDownload } from "../_lib/b2-storage.js";

const compKey = (compId: string, filename: string) =>
  `easeverse/comps/${compId}/${(filename || "export.wav").replace(/[^A-Za-z0-9._-]/g, "_").slice(-120)}`;

// S3 comp exports require project membership; old B2 exports remain readable.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthConfigured())
    return res.status(503).json({ error: "Auth is not configured." });

  // GET = nedlastings-proxy (presignert B2 GET).
  if (req.method === "GET") {
    const compId = typeof req.query.id === "string" ? req.query.id : null;
    if (!compId)
      return res.status(400).json({ error: "id query param required" });
    const comp = await getComp(compId);
    if (!comp || !comp.exportedFilename)
      return res.status(404).json({ error: "Comp export not found" });
    if (
      comp.exportedWavUrl?.startsWith(
        `${getPublicBase()}/api/takes/asset-audio?`,
      )
    ) {
      const asset = new URL(comp.exportedWavUrl);
      req.query = {
        ...req.query,
        projectId: asset.searchParams.get("projectId") || "",
        objectId: asset.searchParams.get("objectId") || "",
      };
      return playAsset(req, res);
    }
    if (!isB2Configured())
      return res
        .status(503)
        .json({ error: "Legacy audio storage is unavailable." });
    const url = await presignDownload(compKey(compId, comp.exportedFilename));
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.redirect(302, url);
  }

  // PATCH = companion acknowledges it picked up the export and wrote it to disk.
  if (req.method === "PATCH") {
    const userId = await requireAuthOrPairing(req, res);
    if (!userId) return;
    const compId = typeof req.query.id === "string" ? req.query.id : null;
    if (!compId)
      return res.status(400).json({ error: "id query param required" });
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
  const body = typeof req.body === "object" && req.body ? req.body : {};
  if (body.action !== "finalize" && !body.checksumSha256)
    return res
      .status(409)
      .json({ error: "Update EaseVerse to share a verified comp export." });
  req.body = { ...body, purpose: "comp", takeId: body.objectId };
  return uploadAsset(req, res);
}
