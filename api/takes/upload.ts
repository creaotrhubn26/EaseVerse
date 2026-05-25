import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import crypto from "node:crypto";
import { isClerkConfigured, requireAuthOrPairing } from "../_lib/auth.js";
import { createTake, getTakeWithAnalysis } from "../_lib/takes-db.js";
import { processTake } from "../_lib/take-processor.js";
import { getProjectMembership } from "../_lib/projects-db.js";

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
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({
      error: "Vercel Blob is not configured. Enable Vercel Blob in the project and add BLOB_READ_WRITE_TOKEN.",
    });
  }

  const body = req.body as HandleUploadBody;
  // blob.upload-completed comes from Vercel Blob's webhook (no Bearer); only
  // blob.generate-client-token comes from the user and needs Clerk/pairing auth.
  const isClientTokenRequest =
    typeof body === "object" && body !== null && (body as { type?: string }).type === "blob.generate-client-token";

  let userIdForClientToken: string | null = null;
  if (isClientTokenRequest) {
    if (!isClerkConfigured()) {
      return res.status(503).json({ error: "Auth is not configured." });
    }
    userIdForClientToken = await requireAuthOrPairing(req, res);
    if (!userIdForClientToken) return;
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req as unknown as Request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = clientPayload ? JSON.parse(clientPayload) : null;
        const projectId = payload?.projectId ?? null;
        if (projectId && userIdForClientToken) {
          const membership = await getProjectMembership(projectId, userIdForClientToken);
          if (!membership || membership.role === "observer") {
            throw new Error("You can't upload takes to this project");
          }
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: 200 * 1024 * 1024,
          tokenPayload: JSON.stringify({
            userId: userIdForClientToken,
            externalTrackId: payload?.externalTrackId ?? null,
            sourcePath: payload?.sourcePath ?? null,
            filename: payload?.filename ?? null,
            projectId,
            lyricsSnapshot:
              typeof payload?.lyricsSnapshot === "string"
                ? payload.lyricsSnapshot.slice(0, 10000)
                : null,
            liveSessionId: payload?.liveSessionId ?? null,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log("[takes/upload] onUploadCompleted fired", {
          blobUrl: blob.url,
          blobPathname: blob.pathname,
          hasTokenPayload: !!tokenPayload,
        });
        try {
          const meta = tokenPayload ? JSON.parse(tokenPayload) : {};
          console.log("[takes/upload] parsed meta", { hasUserId: !!meta.userId, externalTrackId: meta.externalTrackId });
          if (!meta.userId) {
            console.warn("[takes/upload] missing userId in tokenPayload, skipping createTake");
            return;
          }
          const takeId = crypto.randomBytes(12).toString("base64url");
          await createTake({
            id: takeId,
            userId: meta.userId,
            externalTrackId: meta.externalTrackId,
            sourcePath: meta.sourcePath,
            filename: meta.filename || blob.pathname,
            storageUrl: blob.url,
            projectId: meta.projectId ?? null,
            lyricsSnapshot: meta.lyricsSnapshot ?? null,
            liveSessionId: meta.liveSessionId ?? null,
          });
          console.log("[takes/upload] createTake OK", { takeId, externalTrackId: meta.externalTrackId });
          const take = await getTakeWithAnalysis(takeId);
          if (take) {
            void processTake(take).catch((err) =>
              console.warn("[takes/upload] processTake failed:", err),
            );
          }
        } catch (err) {
          console.error("[takes/upload] onUploadCompleted ERROR:", err);
          throw err;
        }
      },
    });
    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error("Upload handler error:", error);
    return res.status(400).json({ error: (error as Error).message || "Upload failed" });
  }
}
