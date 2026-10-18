import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "./_lib/auth.js";
import {
  soundRoomContext,
  soundRoomStorage,
  SoundRoomStorageError,
} from "./_lib/creatorhub-storage.js";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!["GET", "POST"].includes(req.method || "")) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const user = await requireAuth(req, res);
  if (!user) return;
  try {
    const id = req.method === "GET" ? req.query.projectId : req.body?.projectId;
    const context = await soundRoomContext(
      typeof id === "string" ? id : null,
      user
    );
    if (!context) return res.status(403).json({ error: "Project unavailable" });
    const operation =
      req.method === "GET" ? "collaboration" : "collaboration-files";
    const result = await soundRoomStorage(
      operation,
      context,
      req.method === "GET" ? {} : { requestId: req.body?.requestId }
    );
    return res.json(result);
  } catch (e) {
    return res
      .status(e instanceof SoundRoomStorageError ? e.status : 503)
      .json({ error: "Could not load the recording request. Try again." });
  }
}
