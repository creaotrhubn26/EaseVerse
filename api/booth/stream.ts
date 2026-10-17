import { ensureCreatorHubProjectLinksSchema } from "../_lib/creatorhub-project-links.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { Pool } from "pg";
import { ensureTakesSchema, listRegionsForTakes } from "../_lib/takes-db.js";
import { requireAuth } from "../_lib/auth.js";
import { buildLinkedBoothPayload } from "../_lib/booth-payload.js";

export const config = { maxDuration: 60 };

// Server-Sent Events stream of the same booth payload that /api/booth
// returns, but pushed every time state changes (vs the old 2s poll).
// Holds the connection for ~50s, then EventSource on the client
// reconnects automatically, so we stay inside Vercel's 60s function cap.
const HOLD_MS = 50_000;
const POLL_MS = 5000;

let pool: Pool | null = null;
function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return pool;
}


function hashPayload(obj: unknown): string {
  return crypto.createHash("sha1").update(JSON.stringify(obj, (key, value) => ["url", "expiresAt"].includes(key) ? undefined : value)).digest("hex");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const userId = await requireAuth(req, res); if (!userId) return;
  const p = getPool(); if (!p) return res.status(503).json({ error: "Database unavailable" });
  await ensureTakesSchema();
    await ensureCreatorHubProjectLinksSchema();
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const trackId = typeof req.query.trackId === "string" ? req.query.trackId : null;
  if (!trackId) return res.status(400).json({ error: "trackId required" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "private, no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Hint client to reconnect right away if we drop.
  res.write("retry: 1000\n\n");

  const started = Date.now();
  let lastHash = "";
  let closed = false;
  req.on("close", () => {
    closed = true;
  });

  // Send the first snapshot immediately so the page paints without waiting.
  try {
    const initial = await buildLinkedBoothPayload(p, userId, trackId, projectId);
    if (initial) {
      lastHash = hashPayload(initial);
      res.write(`event: snapshot\ndata: ${JSON.stringify(initial)}\n\n`);
    }
  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: (err as Error).message })}\n\n`);
  }

  while (!closed && Date.now() - started < HOLD_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    if (closed) break;
    try {
      const snap = await buildLinkedBoothPayload(p, userId, trackId, projectId);
      if (!snap) continue;
      const h = hashPayload(snap);
      if (h === lastHash) {
        // Heartbeat so proxies don't drop the idle connection.
        res.write(`: keepalive ${Date.now()}\n\n`);
        continue;
      }
      lastHash = h;
      res.write(`event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`);
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: (err as Error).message })}\n\n`);
    }
  }

  res.end();
}
