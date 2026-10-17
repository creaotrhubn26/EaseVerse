import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/auth.js";
import {
  soundRoomContext,
  soundRoomStorage,
} from "../_lib/creatorhub-storage.js";
import {
  getComp,
  getTakeWithAnalysis,
  markCompExported,
  updateProducerMemo,
} from "../_lib/takes-db.js";
import { getProjectMembership } from "../_lib/projects-db.js";
import { getPublicBase } from "../_lib/public-base.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const body = req.body || {};
    const purpose = body.purpose;
    if (!["memo", "comp"].includes(purpose))
      return res.status(400).json({ error: "Invalid audio purpose" });
    const take =
      purpose === "memo"
        ? await getTakeWithAnalysis(String(body.parentTakeId || ""))
        : null;
    const comp =
      purpose === "comp" ? await getComp(String(body.compId || "")) : null;
    const projectId = take?.projectId || comp?.projectId;
    if (!projectId)
      return res
        .status(409)
        .json({
          error: "Choose a linked Sound Room project before sharing audio.",
        });
    const member = await getProjectMembership(projectId, userId);
    if (
      !member ||
      member.role === "observer" ||
      (purpose === "memo" && member.role !== "producer")
    )
      return res.status(403).json({ error: "Project access required" });
    const context = await soundRoomContext(projectId, userId);
    if (!context)
      return res
        .status(409)
        .json({ error: "The project is not linked to Sound Room." });
    const asset = {
      assetPurpose: purpose,
      assetId: String(take?.id || comp?.id),
    };
    if (body.action !== "finalize") {
      const size = Number(body.byteSize);
      if (
        !Number.isSafeInteger(size) ||
        size <= 0 ||
        size > 200 * 1024 * 1024 ||
        !/^[a-f0-9]{64}$/i.test(String(body.checksumSha256 || ""))
      )
        return res
          .status(400)
          .json({ error: "A valid size and checksum are required" });
      const ticket = await soundRoomStorage("initiate", context, {
        ...asset,
        fileName: String(
          body.filename ||
            (purpose === "memo" ? "Producer memo.webm" : "Comp.wav"),
        ).slice(0, 200),
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
          projectId,
          provider: "creatorhub-s3",
        });
    }
    const completed = await soundRoomStorage(
      `${String(body.takeId)}/complete`,
      context,
      { ...asset, parts: body.parts },
    );
    if (!completed.objectId)
      return res
        .status(503)
        .json({ error: "Could not finish this audio upload" });
    const url = `${getPublicBase()}/api/takes/asset-audio?projectId=${encodeURIComponent(projectId)}&objectId=${encodeURIComponent(String(completed.objectId))}`;
    if (take) {
      await updateProducerMemo({
        takeId: take.id,
        userId: take.userId,
        memoUrl: url,
        durationSec: Number.isFinite(Number(body.durationSec))
          ? Number(body.durationSec)
          : null,
      });
    } else if (comp) {
      await markCompExported({
        compId: comp.id,
        url,
        filename: String(body.filename || "Comp.wav").slice(0, 200),
      });
    }
    return res.status(200).json({ take: { storageUrl: url }, url });
  } catch (error) {
    console.error("[asset-upload] failed", error);
    return res
      .status(503)
      .json({
        error: "Could not share this audio. Keep the recording and try again.",
      });
  }
}
