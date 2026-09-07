import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/auth.js";
import { getCreatorHubProjectLink } from "../_lib/creatorhub-project-links.js";
import { getProTools } from "../_lib/collab-store.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId.trim().slice(0, 160) : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  const link = await getCreatorHubProjectLink(projectId, userId);
  if (!link) return res.status(404).json({ error: "CreatorHub project link not found" });
  if (!link.externalTrackId) return res.status(200).json({ linked: true, link, item: null });
  const result = await getProTools(
    link.externalTrackId,
    link.audioReviewProjectId ?? undefined,
    link.ownerUserId,
  );
  return res.status(200).json({ linked: true, link, storage: result.storage, item: result.record });
}
