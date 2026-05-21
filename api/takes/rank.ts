import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { listTakesForGroup } from "../_lib/takes-db.js";
import { rankAndMarkBestTake, scoreComposite } from "../_lib/take-grouping.js";
import { getProjectMembership } from "../_lib/projects-db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const externalTrackId = typeof req.query.trackId === "string" ? req.query.trackId : null;
  if (!externalTrackId) return res.status(400).json({ error: "trackId required" });

  // First make sure best_take flags are fresh (cheap; runs scorer + writes
  // any changed bits). If the take's project_id is set, enforce membership.
  const takesPreview = await listTakesForGroup(userId, externalTrackId);
  if (takesPreview.length === 0) {
    return res.status(200).json({ trackId: externalTrackId, ranked: [], suggestion: null });
  }
  const projectId = takesPreview[0].projectId;
  if (projectId) {
    const m = await getProjectMembership(projectId, userId);
    if (!m) return res.status(403).json({ error: "Not a member of this project" });
  }

  const { ranked } = await rankAndMarkBestTake(userId, externalTrackId);

  // Build a compact suggestion: full duration of the top-scored take.
  const top = ranked[0];
  const topTake = top
    ? takesPreview.find((t) => t.id === top.takeId)
    : null;
  const suggestion =
    top && topTake
      ? {
          takeId: top.takeId,
          startSec: 0,
          endSec: topTake.durationSec ?? 0,
          sectionLabel: `AI pick · score ${top.score.toFixed(0)}`,
        }
      : null;

  return res.status(200).json({
    trackId: externalTrackId,
    ranked: ranked.map((r) => ({
      takeId: r.takeId,
      score: Math.round(r.score),
      components: {
        timing: r.components.timing,
        pronunciation: r.components.pronunciation,
        pitchStability: r.components.pitchStability ? Math.round(r.components.pitchStability) : null,
        energyConsistency: r.components.energyConsistency ? Math.round(r.components.energyConsistency) : null,
      },
    })),
    suggestion,
    debug: { scoreComposite: scoreComposite.length },
  });
}
