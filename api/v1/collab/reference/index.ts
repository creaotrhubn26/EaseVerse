import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isExternalKeyAuthorized } from "../../../_lib/collab-store.js";
import { updateCreatorHubReferenceMix } from "../../../_lib/creatorhub-project-links.js";

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function safeAudioUrl(value: unknown): string | null {
  const raw = text(value, 2000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && local && url.protocol === "http:")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isExternalKeyAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {}) as Record<string, unknown>;
  const ownerUserId = text(body.ownerUserId, 160);
  const externalTrackId = text(body.externalTrackId, 160);
  const url = safeAudioUrl(body.url);
  if (!ownerUserId || !externalTrackId || !url) {
    return res.status(400).json({ error: "ownerUserId, externalTrackId and a secure url are required" });
  }
  const duration = Number(body.durationSec);
  const updatedProjects = await updateCreatorHubReferenceMix({
    ownerUserId,
    externalTrackId,
    url,
    name: text(body.name, 300),
    durationSec: Number.isFinite(duration) && duration >= 0 ? duration : null,
  });
  return res.status(200).json({ updatedProjects });
}
