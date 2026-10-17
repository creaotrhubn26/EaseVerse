import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuthOrPairing } from "../_lib/auth.js";
import {
  soundRoomContext,
  soundRoomStorage,
} from "../_lib/creatorhub-storage.js";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  const userId = await requireAuthOrPairing(req, res);
  if (!userId) return;
  try {
    const body = req.body || {};
    const context = await soundRoomContext(
      typeof body.projectId === "string" ? body.projectId : null,
      userId,
    );
    if (!context)
      return res.status(403).json({ error: "Project access required" });
    const result = await soundRoomStorage(
      `${String(body.takeId)}/parts`,
      context,
      { parts: body.parts },
    );
    return res.status(200).json(result);
  } catch {
    return res
      .status(503)
      .json({
        error: "Could not resume the upload. Your recording has been kept.",
      });
  }
}
