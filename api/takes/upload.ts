import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuthOrPairing } from "../_lib/auth.js";
import {
  soundRoomContext,
  soundRoomStorage,
  SoundRoomStorageError,
} from "../_lib/creatorhub-storage.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const userId = await requireAuthOrPairing(req, res);
  if (!userId) return;
  const body = typeof req.body === "object" && req.body ? req.body : {};
  const size = Number(body.byteSize);
  if (
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > 200 * 1024 * 1024 ||
    !/^[a-f0-9]{64}$/i.test(String(body.checksumSha256 || ""))
  ) {
    return res
      .status(400)
      .json({ error: "A valid file size and SHA-256 checksum are required" });
  }
  try {
    const context = await soundRoomContext(
      typeof body.projectId === "string" ? body.projectId : null,
      userId,
    );
    if (!context)
      return res
        .status(409)
        .json({
          error:
            "Choose a linked Sound Room project before sharing this recording.",
        });
    const ticket = await soundRoomStorage("initiate", context, {
      recordingRequestId: body.recordingRequestId,
      acknowledgeOlderReference: body.acknowledgeOlderReference === true,
      fileName: String(body.filename || "take.wav").slice(0, 200),
      contentType: String(body.contentType || "audio/wav"),
      sizeBytes: size,
      checksumSha256: body.checksumSha256,
    });
    return res
      .status(200)
      .json({
        ...ticket,
        takeId: ticket.objectId,
        key: ticket.objectId,
        provider: "creatorhub-s3",
      });
  } catch (error) {
    if (error instanceof SoundRoomStorageError && error.status === 507)
      return res
        .status(507)
        .json({
          error:
            "The project has no storage space left. Ask the producer to free space before trying again.",
        });
    if (
      error instanceof SoundRoomStorageError &&
      [403, 404].includes(error.status)
    )
      return res
        .status(403)
        .json({
          error:
            "The Sound Room project is not available to this account. Ask the producer to check your access.",
        });
    if (error instanceof SoundRoomStorageError && error.status === 415)
      return res
        .status(415)
        .json({
          error:
            "This audio format is not supported. Use WAV, M4A, MP3, AIFF, FLAC or WebM.",
        });
    return res
      .status(503)
      .json({
        error:
          "Could not prepare the upload. Your recording is still on this device. Try again.",
      });
  }
}
