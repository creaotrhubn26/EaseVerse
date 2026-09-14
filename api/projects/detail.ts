import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAuthConfigured, requireAuth } from "../_lib/auth.js";
import {
  addProjectMember,
  getProjectMembership,
  getProjectWithMembers,
  removeProjectMember,
  upsertPendingInvite,
  type ProjectRole,
} from "../_lib/projects-db.js";
import { findUserByEmail } from "../_lib/users-db.js";
import { getCreatorHubProjectLink } from "../_lib/creatorhub-project-links.js";
import { fetchCreatorHubReferencePlayback } from "../_lib/creatorhub-reference-playback.js";

const ROLES: ProjectRole[] = ["producer", "vocalist", "band_member", "mix_engineer", "observer"];

async function resolveUserIdByEmail(email: string): Promise<{ userId: string | null; email: string }> {
  const normalized = email.trim().toLowerCase();
  const user = await findUserByEmail(normalized);
  return { userId: user?.userId ?? null, email: normalized };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const projectId = typeof req.query.id === "string" ? req.query.id : null;
  if (!projectId) return res.status(400).json({ error: "id query param required" });

  if (req.method === "GET") {
    const data = await getProjectWithMembers(projectId, userId);
    if (!data) return res.status(404).json({ error: "Project not found or not yours" });
    const link = await getCreatorHubProjectLink(projectId, userId);
    if (!link?.audioReviewProjectId) return res.status(200).json(data);

    const playback = await fetchCreatorHubReferencePlayback({
      ownerUserId: link.ownerUserId,
      audioReviewProjectId: link.audioReviewProjectId,
    });
    // Linked Sound Room references are private. Never return the stored legacy
    // URL when fresh resolution fails; it may be expired or expose old storage.
    const reference = playback.reference;
    return res.status(200).json({
      ...data,
      project: {
        ...data.project,
        referenceTrackUrl: reference?.url ?? null,
        referenceTrackName: reference?.fileName ?? data.project.referenceTrackName,
        referenceTrackDurationSec: reference?.durationSec ?? data.project.referenceTrackDurationSec,
      },
    });
  }

  if (req.method === "POST") {
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
    const targetUserId = typeof req.query.userId === "string" ? req.query.userId : null;
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
