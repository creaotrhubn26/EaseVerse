import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchUserEmail, isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { createProject, listProjectsForUser } from "../_lib/projects-db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;

  if (req.method === "GET") {
    const projects = await listProjectsForUser(userId);
    return res.status(200).json({ projects });
  }

  if (req.method === "POST") {
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as {
      name?: string;
    };
    const name = (body.name || "").trim();
    if (!name) return res.status(400).json({ error: "name required" });
    const email = await fetchUserEmail(userId);
    const project = await createProject({ name, ownerUserId: userId, ownerEmail: email });
    if (!project) return res.status(503).json({ error: "Database not available" });
    return res.status(200).json({ project });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
