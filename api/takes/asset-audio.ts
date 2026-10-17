import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/auth.js";
import {
  soundRoomContext,
  soundRoomStorage,
} from "../_lib/creatorhub-storage.js";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!["GET", "HEAD"].includes(req.method || "")) {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const context = await soundRoomContext(
      typeof req.query.projectId === "string" ? req.query.projectId : null,
      userId,
      true,
    );
    if (!context) return res.status(404).json({ error: "Project not found" });
    const playback = await soundRoomStorage(
      `${String(req.query.objectId)}/playback`,
      context,
    );
    if (
      typeof playback.url !== "string" ||
      new URL(playback.url).protocol !== "https:"
    )
      throw new Error("Invalid playback");
    return req.query.format === "json"
      ? res.status(200).json(playback)
      : res.redirect(302, playback.url);
  } catch {
    return res.status(404).json({ error: "Audio is not available" });
  }
}
