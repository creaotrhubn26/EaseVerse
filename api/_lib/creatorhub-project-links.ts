import crypto from "node:crypto";
import { Pool } from "pg";
import { createProject, ensureProjectsSchema, getProjectMembership, getProjectWithMembers, updateProjectReferenceTrack } from "./projects-db.js";

let pool: Pool | null = null;
let ready: Promise<void> | null = null;

function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return pool;
}

async function ensureSchema(): Promise<void> {
  const p = getPool();
  if (!p) return;
  await ensureProjectsSchema();
  if (!ready) ready = p.query(`
    CREATE TABLE IF NOT EXISTS creatorhub_project_links (
      id TEXT PRIMARY KEY,
      easeverse_project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      owner_user_id TEXT NOT NULL,
      creatorhub_project_id VARCHAR(160) NOT NULL,
      audio_review_project_id VARCHAR(160),
      external_track_id VARCHAR(160),
      return_to TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (owner_user_id, creatorhub_project_id),
      UNIQUE (easeverse_project_id)
    );
    CREATE INDEX IF NOT EXISTS creatorhub_project_links_track_idx
      ON creatorhub_project_links(owner_user_id, external_track_id);
  `).then(() => undefined);
  return ready;
}

export type CreatorHubProjectLink = {
  id: string;
  easeverseProjectId: string;
  ownerUserId: string;
  creatorhubProjectId: string;
  audioReviewProjectId: string | null;
  externalTrackId: string | null;
  returnTo: string | null;
  createdAt: string;
  updatedAt: string;
};

function map(row: any): CreatorHubProjectLink {
  return {
    id: String(row.id),
    easeverseProjectId: String(row.easeverse_project_id),
    ownerUserId: String(row.owner_user_id),
    creatorhubProjectId: String(row.creatorhub_project_id),
    audioReviewProjectId: row.audio_review_project_id ? String(row.audio_review_project_id) : null,
    externalTrackId: row.external_track_id ? String(row.external_track_id) : null,
    returnTo: row.return_to ? String(row.return_to) : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function safeCreatorHubReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const creatorHub = url.hostname === "creatorhubn.com" || url.hostname.endsWith(".creatorhubn.com");
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || (!creatorHub && !local)) return null;
    url.hash = "";
    return url.toString().slice(0, 600);
  } catch {
    return null;
  }
}

export async function upsertCreatorHubProject(args: {
  ownerUserId: string;
  ownerEmail?: string | null;
  creatorhubProjectId: string;
  audioReviewProjectId?: string | null;
  externalTrackId?: string | null;
  projectName: string;
  returnTo?: string | null;
}): Promise<{ link: CreatorHubProjectLink; project: NonNullable<Awaited<ReturnType<typeof createProject>>> } | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const existing = await p.query(
    `SELECT * FROM creatorhub_project_links WHERE owner_user_id=$1 AND creatorhub_project_id=$2 LIMIT 1`,
    [args.ownerUserId, args.creatorhubProjectId],
  );
  if (existing.rows[0]) {
    const updated = await p.query(
      `UPDATE creatorhub_project_links SET
         audio_review_project_id=COALESCE($3,audio_review_project_id),
         external_track_id=COALESCE($4,external_track_id),
         return_to=COALESCE($5,return_to),updated_at=NOW()
       WHERE owner_user_id=$1 AND creatorhub_project_id=$2 RETURNING *`,
      [args.ownerUserId, args.creatorhubProjectId, args.audioReviewProjectId ?? null,
       args.externalTrackId ?? null, safeCreatorHubReturnTo(args.returnTo)],
    );
    const link = map(updated.rows[0]);
    const data = await getProjectWithMembers(link.easeverseProjectId, args.ownerUserId);
    return data ? { link, project: data.project } : null;
  }

  const project = await createProject({
    name: args.projectName.slice(0, 200) || "CreatorHub song",
    ownerUserId: args.ownerUserId,
    ownerEmail: args.ownerEmail,
  });
  if (!project) return null;
  const inserted = await p.query(
    `INSERT INTO creatorhub_project_links
       (id,easeverse_project_id,owner_user_id,creatorhub_project_id,audio_review_project_id,external_track_id,return_to)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (owner_user_id,creatorhub_project_id) DO UPDATE SET
       audio_review_project_id=COALESCE(EXCLUDED.audio_review_project_id,creatorhub_project_links.audio_review_project_id),
       external_track_id=COALESCE(EXCLUDED.external_track_id,creatorhub_project_links.external_track_id),
       return_to=COALESCE(EXCLUDED.return_to,creatorhub_project_links.return_to),updated_at=NOW()
     RETURNING *`,
    [`chl_${crypto.randomBytes(9).toString("base64url")}`, project.id, args.ownerUserId,
     args.creatorhubProjectId, args.audioReviewProjectId ?? null, args.externalTrackId ?? null,
     safeCreatorHubReturnTo(args.returnTo)],
  );
  const link = map(inserted.rows[0]);
  if (link.easeverseProjectId !== project.id) {
    const canonical = await getProjectWithMembers(link.easeverseProjectId, args.ownerUserId);
    return canonical ? { link, project: canonical.project } : null;
  }
  return { link, project };
}

export async function getCreatorHubProjectLink(
  easeverseProjectId: string,
  viewerUserId: string,
): Promise<CreatorHubProjectLink | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const membership = await getProjectMembership(easeverseProjectId, viewerUserId);
  if (!membership) return null;
  const result = await p.query(
    `SELECT * FROM creatorhub_project_links WHERE easeverse_project_id=$1 LIMIT 1`,
    [easeverseProjectId],
  );
  return result.rows[0] ? map(result.rows[0]) : null;
}

export async function updateCreatorHubReferenceMix(args: {
  ownerUserId: string;
  externalTrackId: string;
  url: string;
  name: string | null;
  durationSec: number | null;
}): Promise<number> {
  const p = getPool();
  if (!p) return 0;
  await ensureSchema();
  const links = await p.query(
    `SELECT easeverse_project_id FROM creatorhub_project_links
      WHERE owner_user_id=$1 AND external_track_id=$2`,
    [args.ownerUserId, args.externalTrackId],
  );
  let updated = 0;
  for (const row of links.rows) {
    if (await updateProjectReferenceTrack({
      projectId: String(row.easeverse_project_id),
      ownerUserId: args.ownerUserId,
      url: args.url,
      name: args.name,
      durationSec: args.durationSec,
    })) updated += 1;
  }
  return updated;
}

export { ensureSchema as ensureCreatorHubProjectLinksSchema };

/** Invitation was verified against the CreatorHub account before this call.
 * Retry-safe; never grants producer rights or overwrites an existing role. */
export async function acceptSoundRoomProjectInvitation(
  context: {
    ownerUserId: string;
    audioReviewProjectId: string;
    externalTrackId: string | null;
    easeverseAccess: boolean;
    profile: { role: string };
  },
  actorUserId: string,
  email: string,
): Promise<{ projectId: string; trackId: string | null } | null> {
  const p = getPool();
  if (!p) throw new Error("Project synchronization unavailable");
  await ensureSchema();
  const result = await p.query(
    `SELECT easeverse_project_id FROM creatorhub_project_links
     WHERE owner_user_id=$1 AND audio_review_project_id=$2
       AND external_track_id IS NOT DISTINCT FROM $3 LIMIT 1`,
    [context.ownerUserId, context.audioReviewProjectId, context.externalTrackId],
  );
  const projectId = result.rows[0]?.easeverse_project_id;
  if (!projectId) return null;
  if (context.easeverseAccess) {
    const role = /observer|observat/i.test(context.profile.role) ? "observer"
      : /vokal|vocal|artist|sanger/i.test(context.profile.role) ? "vocalist"
      : /mix|miks|teknik/i.test(context.profile.role) ? "mix_engineer" : "band_member";
    await p.query(
      `INSERT INTO project_members (project_id,user_id,email,role,invited_by_user_id)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (project_id,user_id) DO NOTHING`,
      [projectId, actorUserId, email, role, context.ownerUserId],
    );
  }
  const member = await getProjectMembership(projectId, actorUserId);
  return member ? { projectId, trackId: context.externalTrackId } : null;
}

/** Only a personal membership issued by the owner of a linked Sound Room
 * project unlocks the artist workspace. Personal/unlinked projects and the
 * producer's own project cannot bypass prototype approval. */
export async function getInvitedStudioProjects(userId: string): Promise<string[]> {
  const p = getPool();
  if (!p) throw new Error("Project access unavailable");
  await ensureSchema();
  const { rows } = await p.query<{ project_id: string }>(
    `SELECT DISTINCT m.project_id FROM project_members m
     JOIN projects p ON p.id=m.project_id
     JOIN creatorhub_project_links l ON l.easeverse_project_id=p.id AND l.owner_user_id=p.owner_user_id
     WHERE m.user_id=$1 AND m.user_id<>p.owner_user_id
       AND m.invited_by_user_id=p.owner_user_id
       AND m.role IN ('vocalist','band_member','mix_engineer','observer')
       AND l.audio_review_project_id IS NOT NULL
     ORDER BY m.project_id LIMIT 100`, [userId],
  );
  return rows.map(row => row.project_id);
}
