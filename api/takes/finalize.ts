import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuthOrPairing } from "../_lib/auth.js";
import { createTake, getTakeWithAnalysis } from "../_lib/takes-db.js";
import { processTake } from "../_lib/take-processor.js";
import { getProjectMembership } from "../_lib/projects-db.js";

// Steg 2 av take-opplasting (B2): kalles etter at klienten har PUT-et fila til
// presignert URL. Oppretter take-raden (storage_url = stabil proxy-URL) og
// trigger prosessering. B2-nøkkelen rekonstrueres deterministisk fra id+filnavn.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }
  const userId = await requireAuthOrPairing(req, res);
  if (!userId) return;

  try {
    const body = (typeof req.body === "object" && req.body) || {};
    const b = body as Record<string, unknown>;
    const takeId = String(b.takeId || "");
    const filename = String(b.filename || "take.wav").slice(0, 200);
    if (!takeId) return res.status(400).json({ error: "takeId required" });

    const projectId = (b.projectId as string | null) ?? null;
    if (projectId) {
      const membership = await getProjectMembership(projectId, userId);
      if (!membership || membership.role === "observer") {
        return res.status(403).json({ error: "You can't upload takes to this project" });
      }
    }

    // Stabil avspillings-URL (samme origin) — proxy presignerer GET ved behov.
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "easeverse.vercel.app");
    const proto = String(req.headers["x-forwarded-proto"] || "https");
    const storageUrl = `${proto}://${host}/api/takes/${takeId}/audio`;

    const take = await createTake({
      id: takeId,
      userId,
      externalTrackId: (b.externalTrackId as string | null) ?? null,
      sourcePath: (b.sourcePath as string | null) ?? null,
      filename,
      byteSize: Number(b.byteSize || 0) || undefined,
      storageUrl,
      projectId,
      lyricsSnapshot:
        typeof b.lyricsSnapshot === "string" ? (b.lyricsSnapshot as string).slice(0, 10000) : null,
      liveSessionId: (b.liveSessionId as string | null) ?? null,
    });
    if (!take) return res.status(500).json({ error: "Could not create take" });

    const full = await getTakeWithAnalysis(take.id);
    if (full) {
      void processTake(full).catch((err) => console.warn("[takes/finalize] processTake failed:", err));
    }
    return res.status(200).json({ take: full ?? take });
  } catch (error) {
    console.error("[takes/finalize] error:", error);
    return res.status(500).json({ error: (error as Error).message || "Finalize failed" });
  }
}
