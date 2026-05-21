import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuthOrPairing } from "../_lib/auth.js";
import { listKeeperTakes } from "../_lib/takes-db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }
  const userId = await requireAuthOrPairing(req, res);
  if (!userId) return;

  const takes = await listKeeperTakes(userId);
  return res.status(200).json({
    keepers: takes.map((t) => ({
      id: t.id,
      filename: t.filename,
      sourcePath: t.sourcePath,
      externalTrackId: t.externalTrackId,
      durationSec: t.durationSec,
      uploadedAt: t.uploadedAt,
      producerNote: t.producerNote,
      producerMemoUrl: t.producerMemoUrl,
    })),
    generatedAt: new Date().toISOString(),
  });
}
