import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import crypto from "node:crypto";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { createTake, getTakeWithAnalysis } from "../_lib/takes-db.js";
import { processTake } from "../_lib/take-processor.js";

const ALLOWED_CONTENT_TYPES = [
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/aiff",
  "audio/x-aiff",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/flac",
  "audio/ogg",
  "application/octet-stream",
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({
      error: "Vercel Blob is not configured. Enable Vercel Blob in the project and add BLOB_READ_WRITE_TOKEN.",
    });
  }

  try {
    const body = req.body as HandleUploadBody;
    const jsonResponse = await handleUpload({
      body,
      request: req as unknown as Request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = clientPayload ? JSON.parse(clientPayload) : null;
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: 200 * 1024 * 1024,
          tokenPayload: JSON.stringify({
            userId,
            externalTrackId: payload?.externalTrackId ?? null,
            sourcePath: payload?.sourcePath ?? null,
            filename: payload?.filename ?? null,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const meta = tokenPayload ? JSON.parse(tokenPayload) : {};
        if (!meta.userId) return;
        const takeId = crypto.randomBytes(12).toString("base64url");
        await createTake({
          id: takeId,
          userId: meta.userId,
          externalTrackId: meta.externalTrackId,
          sourcePath: meta.sourcePath,
          filename: meta.filename || blob.pathname,
          storageUrl: blob.url,
        });
        const take = await getTakeWithAnalysis(takeId);
        if (take) {
          void processTake(take).catch((err) =>
            console.warn("processTake failed:", err),
          );
        }
      },
    });
    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error("Upload handler error:", error);
    return res.status(400).json({ error: (error as Error).message || "Upload failed" });
  }
}
