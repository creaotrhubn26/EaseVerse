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
  const projectId =
    req.method === "GET" ? req.query.projectId : req.body?.projectId;
  if (typeof projectId !== "string" || !projectId)
    return res.status(400).json({ error: "Choose a linked project" });
  if (
    req.method === "POST" &&
    (typeof req.body?.routineId !== "string" ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(
        req.body.routineId
      ))
  )
    return res.status(400).json({ error: "Choose a routine" });
  try {
    const context = await soundRoomContext(
      projectId,
      user,
      req.method === "GET"
    );
    if (!context)
      return res
        .status(403)
        .json({ error: "This Sound Room project is not available to you." });
    const result = await soundRoomStorage(
      req.method === "GET" ? "warmups" : "warmup-complete",
      context,
      req.method === "POST" ? { routineId: req.body.routineId } : {}
    );
    return res.status(200).json(result);
  } catch (e) {
    return res
      .status(e instanceof SoundRoomStorageError ? e.status : 503)
      .json({ error: "Could not update your warmup. Try again." });
  }
}
