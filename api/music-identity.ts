import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "./_lib/auth.js";
import {
  soundRoomContext,
  soundRoomStorage,
  SoundRoomStorageError,
} from "./_lib/creatorhub-storage.js";
export function createMusicIdentityHandler(
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
      return res.status(405).json({ error: "method_not_allowed" });
    }
    const user = await deps.auth(req, res);
    if (!user) return;
    const projectId =
      req.method === "GET" ? req.query.projectId : req.body?.projectId;
    if (typeof projectId !== "string" || !projectId.trim())
      return res.status(400).json({ error: "project_required" });
    try {
      const context = await deps.context(projectId, user, req.method === "GET");
      if (!context)
        return res.status(403).json({ error: "linked_project_unavailable" });
      const action = req.method === "GET" ? "read" : req.body?.action;
      if (
        ![
          "read",
          "preview",
          "link",
          "refresh",
          "artists",
          "adopt-artists",
          "unlink",
          "portfolio",
        ].includes(action)
      )
        return res.status(400).json({ error: "invalid_action" });
      const payload =
        req.method === "GET"
          ? {}
          : {
              revision: req.body?.revision,
              reference: req.body?.reference,
              artistIds: req.body?.artistIds,
              visible: req.body?.visible,
            };
      return res.json(
        await deps.storage("music-identity", context, { action, payload })
      );
    } catch (e) {
      return res
        .status(e instanceof SoundRoomStorageError ? e.status : 503)
        .json({ error: "music_catalog_unavailable" });
    }
  };
}
export default createMusicIdentityHandler();
