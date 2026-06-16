import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { isClerkConfigured, requireAuthOrPairing } from "../_lib/auth.js";
import { getProjectMembership } from "../_lib/projects-db.js";
import { isB2Configured, presignUpload, takeObjectKey } from "../_lib/b2-storage.js";

const MAX_BYTES = 200 * 1024 * 1024;

// Steg 1 av take-opplasting (B2): autentiser, sjekk prosjekt-tilgang, og gi
// klienten en presignert PUT-URL. Klienten PUT-er fila direkte til Backblaze B2
// (RN-trygt — ingen Vercel Blob / Web Crypto), og kaller deretter /api/takes/finalize.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isB2Configured()) {
    return res.status(503).json({ error: "B2 storage is not configured (B2_APPLICATION_KEY_ID/KEY/BUCKET)." });
  }
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }

  const userId = await requireAuthOrPairing(req, res);
  if (!userId) return;

  try {
    const body = (typeof req.body === "object" && req.body) || {};
    const filename = String((body as { filename?: string }).filename || "take.wav").slice(0, 200);
    const contentType = String((body as { contentType?: string }).contentType || "application/octet-stream");
    const projectId = (body as { projectId?: string | null }).projectId ?? null;
    const byteSize = Number((body as { byteSize?: number }).byteSize || 0);

    if (byteSize && byteSize > MAX_BYTES) {
      return res.status(413).json({ error: "File too large (max 200 MB)." });
    }
    if (projectId) {
      const membership = await getProjectMembership(projectId, userId);
      if (!membership || membership.role === "observer") {
        return res.status(403).json({ error: "You can't upload takes to this project" });
      }
    }

    const takeId = crypto.randomBytes(12).toString("base64url");
    const key = takeObjectKey(takeId, filename);
    const uploadUrl = await presignUpload(key, contentType);

    return res.status(200).json({ takeId, uploadUrl, key, filename, contentType });
  } catch (error) {
    console.error("[takes/upload] presign error:", error);
    return res.status(500).json({ error: (error as Error).message || "Could not create upload URL" });
  }
}
