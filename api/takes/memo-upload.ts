import type { VercelRequest, VercelResponse } from "@vercel/node";
import uploadAsset from "./asset-upload.js";
// Backwards-compatible route name. New bytes always use CreatorHub S3.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const body = typeof req.body === "object" && req.body ? req.body : {};
  if (
    req.method === "POST" &&
    body.action !== "finalize" &&
    !body.checksumSha256
  )
    return res
      .status(409)
      .json({ error: "Update EaseVerse to share a verified audio recording." });
  req.body = {
    ...body,
    purpose: "memo",
    parentTakeId: body.parentTakeId || body.takeId,
    takeId: body.action === "finalize" ? body.objectId : undefined,
  };
  return uploadAsset(req, res);
}
