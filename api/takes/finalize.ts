import { soundRoomContext, soundRoomStorage } from '../_lib/creatorhub-storage.js';
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAuthConfigured, requireAuthOrPairing } from "../_lib/auth.js";
import { createTake, getTakeWithAnalysis } from "../_lib/takes-db.js";
import { getPublicBase } from "../_lib/public-base.js";
import { processTake } from "../_lib/take-processor.js";
import { getProjectMembership } from "../_lib/projects-db.js";

// Finalize verified private S3 bytes before publishing the take to the producer.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isAuthConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }
  const userId = await requireAuthOrPairing(req, res);
  if (!userId) return;

  try {
    const body = (typeof req.body === "object" && req.body) || {};
    const b = body as Record<string, unknown>;
    const takeId = String(b.takeId || "");
    const filename = String(b.filename || "take.wav").slice(0, 200);
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(takeId)) return res.status(400).json({ error: "Valid takeId required" });

    const projectId = (b.projectId as string | null) ?? null;
    if (projectId) {
      const membership = await getProjectMembership(projectId, userId);
      if (!membership || membership.role === "observer") {
        return res.status(403).json({ error: "You can't upload takes to this project" });
      }
    }

    const context = await soundRoomContext(projectId, userId);
    if (!context) return res.status(409).json({ error: 'Choose a linked Sound Room project before sharing this recording.' });
    const existing = await getTakeWithAnalysis(takeId);
    if (existing) {
      if (existing.userId !== userId || existing.projectId !== projectId) return res.status(404).json({ error: 'Take not found' });
      return res.status(200).json({ take: existing, idempotent: true });
    }
    // Complete verified S3 bytes and publish the producer's review version first.
    const completed = await soundRoomStorage(`${takeId}/complete`, context, { parts: b.parts, versionLabel: filename });
    const storageUrl = `${getPublicBase()}/api/takes/${takeId}/audio`;

    let take;
    try { take = await createTake({
      id: takeId,
      userId,
      externalTrackId: context.externalTrackId,
      sourcePath: (b.sourcePath as string | null) ?? null,
      filename,
      byteSize: Number(b.byteSize || 0) || undefined,
      storageUrl,
      projectId,
      lyricsSnapshot:
        typeof b.lyricsSnapshot === "string" ? (b.lyricsSnapshot as string).slice(0, 10000) : null,
      liveSessionId: (b.liveSessionId as string | null) ?? null,
    });
    } catch (error: any) {
      if (error?.code !== '23505') throw error;
      // The same verified object can be finalized twice after a lost response.
      const duplicate = await getTakeWithAnalysis(takeId);
      if (!duplicate || duplicate.userId !== userId || duplicate.projectId !== projectId) throw error;
      return res.status(200).json({ take: duplicate, idempotent: true });
    }
    if (!take) return res.status(500).json({ error: "Could not create take" });

    const full = await getTakeWithAnalysis(take.id);
    if (full) {
      void processTake(full).catch((err) => console.warn("[takes/finalize] processTake failed:", err));
    }
    return res.status(200).json({ take: full ?? take, soundRoomVersionId: completed.version?.id });
  } catch (error) {
    console.error("[takes/finalize] error:", error);
    return res.status(500).json({ error: (error as Error).message || "Finalize failed" });
  }
}
