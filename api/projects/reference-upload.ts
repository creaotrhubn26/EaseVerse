import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import {
  getProjectMembership,
  updateProjectReferenceTrack,
} from "../_lib/projects-db.js";
import { isB2Configured, presignUpload, presignDownload, PUBLIC_BASE } from "../_lib/b2-storage.js";

const refKey = (projectId: string) => `easeverse/projects/${projectId}/reference`;

// Prosjekt-referansespor til Backblaze B2 (samme sted som takes).
//  GET   ?id=<projectId>                 → 302 til presignert B2 GET (avspilling)
//  POST  {projectId} (init)              → presignert PUT (kun produsent)
//  POST  {projectId,action:'finalize'}   → lagre referanse-URL (stabil proxy)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isB2Configured()) return res.status(503).json({ error: "B2 storage is not configured." });

  // GET = avspillings-proxy.
  if (req.method === "GET") {
    const projectId = typeof req.query.id === "string" ? req.query.id : null;
    if (!projectId) return res.status(400).json({ error: "id query param required" });
    const url = await presignDownload(refKey(projectId));
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.redirect(302, url);
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isClerkConfigured()) return res.status(503).json({ error: "Auth is not configured." });
  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    const b = ((typeof req.body === "object" && req.body) || {}) as Record<string, unknown>;
    const projectId = String(b.projectId || "");
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    const membership = await getProjectMembership(projectId, userId);
    if (!membership || membership.role !== "producer") {
      return res.status(403).json({ error: "Only the producer can upload reference tracks" });
    }

    if (b.action === "finalize") {
      await updateProjectReferenceTrack({
        projectId,
        ownerUserId: userId,
        url: `${PUBLIC_BASE}/api/projects/reference-upload?id=${encodeURIComponent(projectId)}`,
        name: (b.name as string | null) ?? null,
        durationSec: typeof b.durationSec === "number" ? (b.durationSec as number) : null,
      });
      return res.status(200).json({ ok: true });
    }

    const contentType = String(b.contentType || "application/octet-stream");
    const uploadUrl = await presignUpload(refKey(projectId), contentType);
    return res.status(200).json({ uploadUrl, key: refKey(projectId) });
  } catch (error) {
    console.error("[reference-upload] error:", error);
    return res.status(500).json({ error: (error as Error).message || "Upload failed" });
  }
}
