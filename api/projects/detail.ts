import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClerkClient } from "@clerk/backend";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import {
  addProjectMember,
  getProjectMembership,
  getProjectWithMembers,
  removeProjectMember,
  upsertPendingInvite,
  type ProjectRole,
} from "../_lib/projects-db.js";

const ROLES: ProjectRole[] = ["producer", "vocalist", "band_member", "mix_engineer", "observer"];

const clerk =
  process.env.CLERK_SECRET_KEY
    ? createClerkClient({
        secretKey: process.env.CLERK_SECRET_KEY,
        publishableKey:
          process.env.CLERK_PUBLISHABLE_KEY ||
          process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
          process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
          "",
      })
    : null;

function getOrigin(req: VercelRequest): string {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "easeverse.vercel.app";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

async function resolveUserIdByEmail(email: string): Promise<{ userId: string | null; email: string }> {
  const normalized = email.trim().toLowerCase();
  if (!clerk) return { userId: null, email: normalized };
  try {
    const users = await clerk.users.getUserList({ emailAddress: [normalized] });
    const user = users.data[0];
    return { userId: user?.id ?? null, email: normalized };
  } catch {
    return { userId: null, email: normalized };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const projectId = typeof req.query.id === "string" ? req.query.id : null;
  if (!projectId) return res.status(400).json({ error: "id query param required" });

  if (req.method === "GET") {
    const data = await getProjectWithMembers(projectId, userId);
    if (!data) return res.status(404).json({ error: "Project not found or not yours" });
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    // Add member
    const viewer = await getProjectMembership(projectId, userId);
    if (!viewer || viewer.role !== "producer") {
      return res.status(403).json({ error: "Only the producer can invite members" });
    }
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as {
      email?: string;
      role?: string;
    };
    const email = (body.email || "").trim().toLowerCase();
    const role = (body.role || "band_member") as ProjectRole;
    if (!email || !ROLES.includes(role)) {
      return res.status(400).json({ error: "email + valid role required" });
    }
    const resolved = await resolveUserIdByEmail(email);
    if (!resolved.userId) {
      const pending = await upsertPendingInvite({
        projectId,
        email: resolved.email,
        role,
        invitedByUserId: userId,
      });
      if (clerk) {
        try {
          await clerk.invitations.createInvitation({
            emailAddress: resolved.email,
            publicMetadata: { projectId, role, pendingInviteId: pending.id },
            redirectUrl: `${getOrigin(req)}/projects/${projectId}`,
          });
        } catch (err) {
          console.warn("Clerk invitation send failed:", err);
        }
      }
      return res.status(202).json({ pending: { id: pending.id, email: resolved.email, role } });
    }
    const member = await addProjectMember({
      projectId,
      userId: resolved.userId,
      email: resolved.email,
      role,
      invitedByUserId: userId,
    });
    return res.status(200).json({ member });
  }

  if (req.method === "DELETE") {
    const viewer = await getProjectMembership(projectId, userId);
    if (!viewer || viewer.role !== "producer") {
      return res.status(403).json({ error: "Only the producer can remove members" });
    }
    const targetUserId =
      typeof req.query.userId === "string" ? req.query.userId : null;
    if (!targetUserId) return res.status(400).json({ error: "userId query param required" });
    if (targetUserId === userId) {
      return res.status(400).json({ error: "Owner cannot remove self" });
    }
    const ok = await removeProjectMember({ projectId, userId: targetUserId });
    return res.status(ok ? 200 : 404).json({ ok });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
