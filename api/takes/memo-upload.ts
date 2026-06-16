import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { getTakeWithAnalysis, updateProducerMemo } from "../_lib/takes-db.js";
import { isB2Configured, presignUpload } from "../_lib/b2-storage.js";

// Produsent-memo til Backblaze B2 (RN-trygt, samme sted som takes).
//  action 'init' (standard): presignert PUT for nøkkel easeverse/memos/<takeId>/memo
//  action 'finalize': lagre producer_memo_url = stabil proxy-URL (?kind=memo)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isClerkConfigured()) return res.status(503).json({ error: "Auth is not configured." });
  if (!isB2Configured()) return res.status(503).json({ error: "B2 storage is not configured." });

  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    const b = ((typeof req.body === "object" && req.body) || {}) as Record<string, unknown>;
    const takeId = String(b.takeId || "");
    if (!takeId) return res.status(400).json({ error: "takeId required" });

    const take = await getTakeWithAnalysis(takeId);
    if (!take || take.userId !== userId) {
      return res.status(403).json({ error: "Take not found or not owned by you" });
    }
    const key = `easeverse/memos/${takeId}/memo`;

    if (b.action === "finalize") {
      const host = String(req.headers["x-forwarded-host"] || req.headers.host || "easeverse.vercel.app");
      const proto = String(req.headers["x-forwarded-proto"] || "https");
      const memoUrl = `${proto}://${host}/api/takes/${takeId}/audio?kind=memo`;
      await updateProducerMemo({
        takeId,
        userId,
        memoUrl,
        durationSec: typeof b.durationSec === "number" ? (b.durationSec as number) : null,
      });
      return res.status(200).json({ ok: true, url: memoUrl });
    }

    const contentType = String(b.contentType || "audio/webm");
    const uploadUrl = await presignUpload(key, contentType);
    return res.status(200).json({ uploadUrl, key });
  } catch (error) {
    console.error("[memo-upload] error:", error);
    return res.status(500).json({ error: (error as Error).message || "Memo upload failed" });
  }
}
