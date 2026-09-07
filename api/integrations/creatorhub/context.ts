import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchUserEmail, requireAuth } from "../../_lib/auth.js";
import { getCreatorHubProjectLink, upsertCreatorHubProject } from "../../_lib/creatorhub-project-links.js";

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  const userId = await requireAuth(req, res);
  if (!userId) return;

  if (req.method === "GET") {
    const projectId = text(req.query.easeverseProjectId, 160);
    if (!projectId) return res.status(400).json({ error: "easeverseProjectId is required" });
    const link = await getCreatorHubProjectLink(projectId, userId);
    return link
      ? res.status(200).json({ linked: true, link })
      : res.status(404).json({ linked: false, error: "CreatorHub project link not found" });
  }

  if (req.method === "POST") {
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {}) as Record<string, unknown>;
    const creatorhubProjectId = text(body.creatorhubProjectId, 160);
    if (!creatorhubProjectId) return res.status(400).json({ error: "creatorhubProjectId is required" });
    const result = await upsertCreatorHubProject({
      ownerUserId: userId,
      ownerEmail: await fetchUserEmail(userId),
      creatorhubProjectId,
      audioReviewProjectId: text(body.audioReviewProjectId, 160),
      externalTrackId: text(body.externalTrackId, 160),
      projectName: text(body.projectName, 200) ?? "CreatorHub song",
      returnTo: text(body.returnTo, 600),
    });
    if (!result) return res.status(503).json({ error: "Project database is unavailable" });
    return res.status(200).json({ linked: true, ...result });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
