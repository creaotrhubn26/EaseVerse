import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "./_lib/auth.js";
import { deleteChangelog, listChangelog, publishChangelog } from "./_lib/changelog-db.js";
import { getUser } from "./_lib/users-db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    // Public to signed-in users (admins or not) when Clerk is configured.
    if (isClerkConfigured()) {
      const userId = await requireAuth(req, res);
      if (!userId) return;
    }
    const limit = typeof req.query.limit === "string" ? Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20)) : 20;
    const entries = await listChangelog(limit);
    return res.status(200).json({ entries });
  }

  if (req.method === "POST" || req.method === "DELETE") {
    if (!isClerkConfigured()) {
      return res.status(503).json({ error: "Auth is not configured." });
    }
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const me = await getUser(userId);
    if (!me || me.status !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }

    if (req.method === "POST") {
      const body = req.body as { title?: string; body?: string; tag?: string } | undefined;
      if (!body?.title || !body.body) {
        return res.status(400).json({ error: "title and body required" });
      }
      const entry = await publishChangelog({
        title: body.title.trim().slice(0, 120),
        body: body.body.trim().slice(0, 5000),
        tag: body.tag?.trim().slice(0, 40) || undefined,
        authorUserId: userId,
      });
      if (!entry) return res.status(503).json({ error: "Database not available." });
      return res.status(201).json(entry);
    }

    // DELETE
    const idParam = typeof req.query.id === "string" ? parseInt(req.query.id, 10) : NaN;
    if (!Number.isInteger(idParam)) {
      return res.status(400).json({ error: "id required" });
    }
    await deleteChangelog(idParam);
    return res.status(204).end();
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
