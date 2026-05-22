import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { getProjectMembership } from "../_lib/projects-db.js";
import { consumeSignals, getLiveSession, listParticipants } from "../_lib/sessions-db.js";

export const config = { maxDuration: 60 };

const HOLD_MS = 50_000;
const POLL_MS = 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const sessionId = typeof req.query.id === "string" ? req.query.id : null;
  if (!sessionId) return res.status(400).json({ error: "id required" });
  const session = await getLiveSession(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  const m = await getProjectMembership(session.projectId, userId);
  if (!m) return res.status(403).json({ error: "Not a member" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.write("retry: 1000\n\n");

  const started = Date.now();
  let lastHash = "";
  let closed = false;
  req.on("close", () => {
    closed = true;
  });

  async function emit() {
    const participants = await listParticipants(sessionId!);
    const payload = {
      session,
      participants,
      now: new Date().toISOString(),
    };
    const h = crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex");
    if (h !== lastHash) {
      lastHash = h;
      res.write(`event: presence\ndata: ${JSON.stringify(payload)}\n\n`);
    } else {
      res.write(`: keepalive\n\n`);
    }
    try {
      const signals = await consumeSignals({ sessionId: sessionId!, toUserId: userId! });
      for (const s of signals) {
        res.write(`event: signal\ndata: ${JSON.stringify(s)}\n\n`);
      }
    } catch {
      /* ignore */
    }
  }

  try {
    await emit();
  } catch {
    /* ignore */
  }
  while (!closed && Date.now() - started < HOLD_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    if (closed) break;
    try {
      await emit();
    } catch {
      /* ignore */
    }
  }
  res.end();
}
