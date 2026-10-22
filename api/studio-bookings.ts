import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "./_lib/auth.js";
import {
  soundRoomContext,
  soundRoomStorage,
  SoundRoomStorageError,
} from "./_lib/creatorhub-storage.js";

export function createStudioBookingsHandler(
  deps = {
    auth: requireAuth,
    context: soundRoomContext,
    storage: soundRoomStorage,
  }
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (!["GET", "POST"].includes(req.method || "")) {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }
    const user = await deps.auth(req, res);
    if (!user) return;
    const raw =
      req.method === "GET" ? req.query.projectId : req.body?.projectId;
    if (typeof raw !== "string" || !raw.trim())
      return res.status(400).json({ error: "Project required" });
    try {
      // Project, producer and actor are resolved from authenticated membership.
      // Never forward caller-supplied owner/actor identities or invitation tokens.
      const context = await deps.context(raw, user);
      if (!context)
        return res.status(403).json({ error: "Linked project unavailable" });
      const result = await deps.storage(
        req.method === "GET" ? "studio-overview" : "studio-upgrade-request",
        context,
        req.method === "POST"
          ? { language: req.body?.language === "no" ? "no" : "en" }
          : {}
      );
      return res.status(req.method === "POST" ? 201 : 200).json(result);
    } catch (e) {
      return res
        .status(e instanceof SoundRoomStorageError ? e.status : 503)
        .json({ error: "Could not update studio sessions. Try again." });
    }
  };
}
export default createStudioBookingsHandler();
