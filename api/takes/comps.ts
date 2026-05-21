import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import {
  createComp,
  deleteComp,
  getComp,
  getTakeById,
  listCompSegments,
  listCompsForTrack,
  replaceCompSegments,
} from "../_lib/takes-db.js";
import { getProjectMembership } from "../_lib/projects-db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;

  if (req.method === "GET") {
    const compId = typeof req.query.id === "string" ? req.query.id : null;
    if (compId) {
      const comp = await getComp(compId);
      if (!comp) return res.status(404).json({ error: "Comp not found" });
      const segments = await listCompSegments(compId);
      return res.status(200).json({ comp, segments });
    }
    const externalTrackId =
      typeof req.query.trackId === "string" ? req.query.trackId : null;
    if (!externalTrackId) {
      return res.status(400).json({ error: "trackId or id query param required" });
    }
    const comps = await listCompsForTrack(externalTrackId);
    return res.status(200).json({ comps });
  }

  if (req.method === "POST") {
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as {
      name?: string;
      externalTrackId?: string;
      projectId?: string;
    };
    if (!body.name?.trim() || !body.externalTrackId?.trim()) {
      return res.status(400).json({ error: "name + externalTrackId required" });
    }
    if (body.projectId) {
      const m = await getProjectMembership(body.projectId, userId);
      if (!m || m.role === "observer") {
        return res.status(403).json({ error: "Observers can't create comps" });
      }
    }
    const comp = await createComp({
      projectId: body.projectId ?? null,
      externalTrackId: body.externalTrackId,
      name: body.name,
      createdByUserId: userId,
    });
    return res.status(200).json({ comp });
  }

  if (req.method === "PUT") {
    const compId = typeof req.query.id === "string" ? req.query.id : null;
    if (!compId) return res.status(400).json({ error: "id query param required" });
    const comp = await getComp(compId);
    if (!comp) return res.status(404).json({ error: "Comp not found" });
    if (comp.projectId) {
      const m = await getProjectMembership(comp.projectId, userId);
      if (!m || m.role === "observer") {
        return res.status(403).json({ error: "Observers can't edit comps" });
      }
    } else if (comp.createdByUserId !== userId) {
      return res.status(403).json({ error: "Not your comp" });
    }
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as {
      segments?: Array<{
        takeId: string;
        startSec: number;
        endSec: number;
        sectionLabel?: string;
      }>;
    };
    if (!Array.isArray(body.segments)) {
      return res.status(400).json({ error: "segments[] required" });
    }
    // Validate each segment's take belongs to same external_track_id.
    for (const s of body.segments) {
      const take = await getTakeById(s.takeId);
      if (!take || take.externalTrackId !== comp.externalTrackId) {
        return res.status(400).json({
          error: `Segment take ${s.takeId} not in this track group`,
        });
      }
    }
    const segments = await replaceCompSegments({
      compId,
      segments: body.segments.map((s) => ({
        takeId: s.takeId,
        startSec: s.startSec,
        endSec: s.endSec,
        sectionLabel: s.sectionLabel ?? null,
      })),
    });
    return res.status(200).json({ comp, segments });
  }

  if (req.method === "DELETE") {
    const compId = typeof req.query.id === "string" ? req.query.id : null;
    if (!compId) return res.status(400).json({ error: "id query param required" });
    const ok = await deleteComp({ compId, userId });
    return res.status(ok ? 200 : 404).json({ ok });
  }

  res.setHeader("Allow", "GET, POST, PUT, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
