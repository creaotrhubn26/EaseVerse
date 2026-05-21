import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isClerkConfigured, requireAuth, requireAuthOrPairing } from "../_lib/auth.js";
import { getComp, markCompDelivered, markCompExported } from "../_lib/takes-db.js";
import { getProjectMembership } from "../_lib/projects-db.js";

const ALLOWED_CONTENT_TYPES = ["audio/wav", "audio/wave", "audio/x-wav"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }

  // PATCH = companion acknowledges that it picked up the export and wrote it
  // to disk. Pairing token or Clerk token both work.
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

  // POST = client-upload flow (browser pushes the rendered WAV).
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, PATCH");
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
    userIdForClientToken = await requireAuth(req, res);
    if (!userIdForClientToken) return;
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req as unknown as Request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = clientPayload ? JSON.parse(clientPayload) : null;
        const compId = payload?.compId as string | undefined;
        if (!compId) throw new Error("compId required");
        const comp = await getComp(compId);
        if (!comp) throw new Error("Comp not found");
        if (comp.projectId) {
          const m = await getProjectMembership(comp.projectId, userIdForClientToken!);
          if (!m || m.role === "observer") {
            throw new Error("Observers can't export comps");
          }
        } else if (comp.createdByUserId !== userIdForClientToken) {
          throw new Error("Not your comp");
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: 300 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            compId,
            filename: payload?.filename ?? `${compId}.wav`,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        try {
          const meta = tokenPayload ? JSON.parse(tokenPayload) : {};
          if (!meta.compId) return;
          await markCompExported({
            compId: meta.compId,
            url: blob.url,
            filename: meta.filename || blob.pathname,
          });
        } catch (err) {
          console.error("[comp-export] onUploadCompleted ERROR:", err);
          throw err;
        }
      },
    });
    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error("Comp export handler error:", error);
    return res.status(400).json({ error: (error as Error).message || "Upload failed" });
  }
}
