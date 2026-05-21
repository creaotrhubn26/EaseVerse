import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import {
  createTakeRegion,
  deleteTakeRegion,
  getTakeById,
  listRegionsForTake,
  updateTakeRegionLoop,
} from "../_lib/takes-db.js";
import { getProjectMembership } from "../_lib/projects-db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;

  if (req.method === "GET") {
    const takeId = typeof req.query.takeId === "string" ? req.query.takeId : null;
    if (!takeId) return res.status(400).json({ error: "takeId query param required" });
    const regions = await listRegionsForTake(takeId);
    return res.status(200).json({ regions });
  }

  if (req.method === "POST") {
    const takeId = typeof req.query.takeId === "string" ? req.query.takeId : null;
    if (!takeId) return res.status(400).json({ error: "takeId query param required" });
    const take = await getTakeById(takeId);
    if (!take) return res.status(404).json({ error: "Take not found" });
    if (take.projectId) {
      const m = await getProjectMembership(take.projectId, userId);
      if (!m || m.role === "observer") {
        return res.status(403).json({ error: "Observers can't create regions" });
      }
    } else if (take.userId !== userId) {
      return res.status(403).json({ error: "Only the take owner can add regions" });
    }
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as {
      startSec?: number;
      endSec?: number;
      label?: string;
      color?: string;
      autoLoop?: boolean;
    };
    if (typeof body.startSec !== "number" || typeof body.endSec !== "number") {
      return res.status(400).json({ error: "startSec + endSec required" });
    }
    const region = await createTakeRegion({
      takeId,
      startSec: body.startSec,
      endSec: body.endSec,
      label: body.label ?? null,
      color: body.color ?? null,
      autoLoop: body.autoLoop ?? false,
      createdByUserId: userId,
    });
    return res.status(200).json({ region });
  }

  if (req.method === "PATCH") {
    const regionId = typeof req.query.id === "string" ? req.query.id : null;
    if (!regionId) return res.status(400).json({ error: "id query param required" });
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as {
      autoLoop?: boolean;
    };
    if (typeof body.autoLoop !== "boolean") {
      return res.status(400).json({ error: "autoLoop required" });
    }
    const region = await updateTakeRegionLoop({
      regionId,
      userId,
      autoLoop: body.autoLoop,
    });
    if (!region) return res.status(404).json({ error: "Region not found or not yours" });
    return res.status(200).json({ region });
  }

  if (req.method === "DELETE") {
    const regionId = typeof req.query.id === "string" ? req.query.id : null;
    if (!regionId) return res.status(400).json({ error: "id query param required" });
    const ok = await deleteTakeRegion({ regionId, userId });
    return res.status(ok ? 200 : 404).json({ ok });
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
