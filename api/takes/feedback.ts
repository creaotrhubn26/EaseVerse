import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { updateProducerFeedback, type ProducerDecision } from "../_lib/takes-db.js";

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

  const updated = await updateProducerFeedback({
    takeId,
    userId,
    producerNote: note,
    producerDecision: decision,
  });
  if (!updated) return res.status(404).json({ error: "Take not found" });
  return res.status(200).json(updated);
}
