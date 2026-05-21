import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { getTakeById, updateProducerFeedback, type ProducerDecision } from "../_lib/takes-db.js";
import { getProjectMembership, getProjectWithMembers } from "../_lib/projects-db.js";
import { pushToUsers } from "../_lib/push-send.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PATCH" && req.method !== "POST") {
    res.setHeader("Allow", "PATCH, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const takeId = typeof req.query.id === "string" ? req.query.id : null;
  if (!takeId) return res.status(400).json({ error: "id query param required" });

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as {
    producerNote?: string | null;
    producerDecision?: ProducerDecision | "clear";
  };

  if (body.producerNote === undefined && body.producerDecision === undefined) {
    return res.status(400).json({ error: "producerNote or producerDecision required" });
  }

  let decision: ProducerDecision | undefined;
  if (body.producerDecision !== undefined) {
    if (body.producerDecision === "keeper" || body.producerDecision === "redo") {
      decision = body.producerDecision;
    } else {
      decision = null;
    }
  }

  let note: string | null | undefined;
  if (body.producerNote !== undefined) {
    note = body.producerNote === null ? null : String(body.producerNote).slice(0, 1000);
  }

  const take = await getTakeById(takeId);
  if (!take) return res.status(404).json({ error: "Take not found" });

  let ownerUserIdForUpdate = take.userId;
  if (take.projectId) {
    const membership = await getProjectMembership(take.projectId, userId);
    if (!membership || membership.role !== "producer") {
      return res.status(403).json({ error: "Only the producer can edit decision/note" });
    }
    ownerUserIdForUpdate = take.userId;
  } else if (take.userId !== userId) {
    return res.status(403).json({ error: "Only the take owner can edit" });
  }

  const previousDecision = take.producerDecision;
  const updated = await updateProducerFeedback({
    takeId,
    userId: ownerUserIdForUpdate,
    producerNote: note,
    producerDecision: decision,
  });
  if (!updated) return res.status(404).json({ error: "Take not found" });

  // Push to other project members when the decision changes (fire-and-forget).
  if (decision !== undefined && decision !== previousDecision && take.projectId) {
    void (async () => {
      try {
        const data = await getProjectWithMembers(take.projectId!, userId);
        const targetUserIds = (data?.members ?? [])
          .filter((m) => m.userId !== userId && m.role !== "observer")
          .map((m) => m.userId);
        if (targetUserIds.length > 0) {
          await pushToUsers({
            userIds: targetUserIds,
            payload: {
              title: decision === "keeper" ? "✅ Keeper marked" : decision === "redo" ? "🔁 Re-do requested" : "Decision cleared",
              body: `${take.filename} on ${take.externalTrackId ?? "unknown track"}`,
              tag: `take-${take.id}`,
              url: take.externalTrackId ? `/booth/${encodeURIComponent(take.externalTrackId)}` : "/",
            },
          });
        }
      } catch (err) {
        console.warn("[feedback] push failed:", (err as Error).message);
      }
    })();
  }

  return res.status(200).json(updated);
}
