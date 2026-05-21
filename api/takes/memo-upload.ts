import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { getTakeWithAnalysis, updateProducerMemo } from "../_lib/takes-db.js";

const ALLOWED_CONTENT_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-m4a",
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
        if (!payload?.takeId) {
          throw new Error("clientPayload.takeId required");
        }
        const take = await getTakeWithAnalysis(payload.takeId);
        if (!take || take.userId !== userIdForClientToken) {
          throw new Error("Take not found or not owned by you");
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: 10 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            userId: userIdForClientToken,
            takeId: payload.takeId,
            durationSec: typeof payload.durationSec === "number" ? payload.durationSec : null,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        try {
          const meta = tokenPayload ? JSON.parse(tokenPayload) : {};
          if (!meta.userId || !meta.takeId) {
            console.warn("[memo-upload] missing meta", meta);
            return;
          }
          await updateProducerMemo({
            takeId: meta.takeId,
            userId: meta.userId,
            memoUrl: blob.url,
            durationSec: meta.durationSec ?? null,
          });
          console.log("[memo-upload] memo saved", { takeId: meta.takeId, url: blob.url });
        } catch (err) {
          console.error("[memo-upload] onUploadCompleted ERROR:", err);
          throw err;
        }
      },
    });
    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error("Memo upload handler error:", error);
    return res.status(400).json({ error: (error as Error).message || "Memo upload failed" });
  }
}
