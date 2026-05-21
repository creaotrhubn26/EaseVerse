import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import {
  getProjectMembership,
  updateProjectReferenceTrack,
} from "../_lib/projects-db.js";

const ALLOWED_CONTENT_TYPES = [
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/flac",
  "audio/ogg",
  "audio/aiff",
  "audio/x-aiff",
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: "Vercel Blob is not configured." });
  }

  const body = req.body as HandleUploadBody;
  const isClientTokenRequest =
    typeof body === "object" && body !== null && (body as { type?: string }).type === "blob.generate-client-token";

  let userIdForClientToken: string | null = null;
  if (isClientTokenRequest) {
    if (!isClerkConfigured()) {
      return res.status(503).json({ error: "Auth is not configured." });
    }
    userIdForClientToken = await requireAuth(req, res);
    if (!userIdForClientToken) return;
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req as unknown as Request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = clientPayload ? JSON.parse(clientPayload) : null;
        const projectId = payload?.projectId as string | undefined;
        if (!projectId) throw new Error("projectId required");
        const membership = await getProjectMembership(projectId, userIdForClientToken!);
        if (!membership || membership.role !== "producer") {
          throw new Error("Only the producer can upload reference tracks");
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: 50 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            projectId,
            ownerUserId: userIdForClientToken,
            name: payload?.name ?? null,
            durationSec: typeof payload?.durationSec === "number" ? payload.durationSec : null,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        try {
          const meta = tokenPayload ? JSON.parse(tokenPayload) : {};
          if (!meta.projectId || !meta.ownerUserId) return;
          await updateProjectReferenceTrack({
            projectId: meta.projectId,
            ownerUserId: meta.ownerUserId,
            url: blob.url,
            name: meta.name ?? null,
            durationSec: meta.durationSec ?? null,
          });
        } catch (err) {
          console.error("[reference-upload] onUploadCompleted ERROR:", err);
          throw err;
        }
      },
    });
    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error("Reference upload handler error:", error);
    return res.status(400).json({ error: (error as Error).message || "Upload failed" });
  }
}
