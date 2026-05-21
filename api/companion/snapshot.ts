import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuthOrPairing } from "../_lib/auth.js";
import {
  listKeeperTakes,
  listRecentCheckpoints,
  listRegionsForTakes,
  listTakesForUser,
} from "../_lib/takes-db.js";
import { getProjectMembership } from "../_lib/projects-db.js";

// Single bundle Companion polls every few seconds:
// 1. keeperTakes  — for Pro Tools track-colour sync
// 2. markers      — extracted @M:SS timestamps from producer notes
// 3. regions      — loop-punch regions
// 4. checkpoints  — recent session snapshots we've stored
//
// Filtered to one project (preferred) or one externalTrackId so the
// companion only sees what it's licensed to act on.
const TIMESTAMP_RE = /@(\d{1,2}:\d{2}(?::\d{2})?)/g;

function parseTimestamps(text: string | null): Array<{ raw: string; seconds: number }> {
  if (!text) return [];
  const out: Array<{ raw: string; seconds: number }> = [];
  let m: RegExpExecArray | null;
  TIMESTAMP_RE.lastIndex = 0;
  while ((m = TIMESTAMP_RE.exec(text)) !== null) {
    const parts = m[1].split(":").map(Number);
    let seconds: number | null = null;
    if (parts.length === 2 && parts[1] < 60) seconds = parts[0] * 60 + parts[1];
    else if (parts.length === 3 && parts[1] < 60 && parts[2] < 60) {
      seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (seconds !== null) out.push({ raw: m[0], seconds });
  }
  return out;
}

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

  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : null;
  const externalTrackId = typeof req.query.trackId === "string" ? req.query.trackId : null;

  if (projectId) {
    const m = await getProjectMembership(projectId, userId);
    if (!m) return res.status(403).json({ error: "Not a member of this project" });
  }

  const keeperTakes = (await listKeeperTakes(userId)).filter((t) => {
    if (projectId) return t.projectId === projectId;
    if (externalTrackId) return t.externalTrackId === externalTrackId;
    return true;
  });

  const allUserTakes = (await listTakesForUser(userId, 200)).filter((t) => {
    if (projectId) return t.projectId === projectId;
    if (externalTrackId) return t.externalTrackId === externalTrackId;
    return true;
  });

  const regionMap = await listRegionsForTakes(allUserTakes.map((t) => t.id));

  const checkpoints = projectId
    ? await listRecentCheckpoints({ projectId, limit: 10 })
    : externalTrackId
      ? await listRecentCheckpoints({ externalTrackId, limit: 10 })
      : [];

  return res.status(200).json({
    generatedAt: new Date().toISOString(),
    keepers: keeperTakes.map((t) => ({
      id: t.id,
      filename: t.filename,
      sourcePath: t.sourcePath,
      externalTrackId: t.externalTrackId,
      durationSec: t.durationSec,
      uploadedAt: t.uploadedAt,
      decisionLockedAt: t.decisionLockedAt,
    })),
    markers: allUserTakes.flatMap((t) => {
      const stamps = parseTimestamps(t.producerNote);
      return stamps.map((s) => ({
        takeId: t.id,
        externalTrackId: t.externalTrackId,
        sourcePath: t.sourcePath,
        filename: t.filename,
        seconds: s.seconds,
        label: t.producerNote?.slice(0, 80) ?? null,
      }));
    }),
    regions: allUserTakes.flatMap((t) =>
      (regionMap.get(t.id) ?? []).map((r) => ({
        regionId: r.id,
        takeId: t.id,
        externalTrackId: t.externalTrackId,
        sourcePath: t.sourcePath,
        filename: t.filename,
        startSec: r.startSec,
        endSec: r.endSec,
        label: r.label,
      })),
    ),
    checkpoints,
  });
}
