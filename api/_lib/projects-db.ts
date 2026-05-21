import { Pool } from "pg";
import crypto from "node:crypto";

let pool: Pool | null = null;
let ensured = false;

function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  }
  return pool;
}

export type ProjectRole = "producer" | "vocalist" | "band_member" | "mix_engineer" | "observer";

const ROLES: ProjectRole[] = ["producer", "vocalist", "band_member", "mix_engineer", "observer"];

function normalizeRole(value: string | null | undefined): ProjectRole {
  if (value && (ROLES as string[]).includes(value)) return value as ProjectRole;
  return "observer";
}

async function ensureSchema(): Promise<void> {
  if (ensured) return;
  const p = getPool();
  if (!p) return;
  await p.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects (owner_user_id);
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS reference_track_url TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS reference_track_name TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS reference_track_duration_sec REAL;

    CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL,
      invited_by_user_id TEXT,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (project_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS project_members_user_idx ON project_members (user_id);

    ALTER TABLE takes ADD COLUMN IF NOT EXISTS project_id TEXT;
    CREATE INDEX IF NOT EXISTS takes_project_idx ON takes (project_id);

    CREATE TABLE IF NOT EXISTS pending_project_invites (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      invited_by_user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days',
      UNIQUE (project_id, email)
    );
    CREATE INDEX IF NOT EXISTS pending_project_invites_email_idx ON pending_project_invites (email);
  `);
  ensured = true;
}

export type ProjectRow = {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
  referenceTrackUrl: string | null;
  referenceTrackName: string | null;
  referenceTrackDurationSec: number | null;
};

export type ProjectMemberRow = {
  projectId: string;
  userId: string;
  email: string | null;
  role: ProjectRole;
  invitedByUserId: string | null;
  joinedAt: string;
};

function generateId(): string {
  return `prj_${crypto.randomBytes(9).toString("base64url")}`;
}

export async function createProject(args: {
  name: string;
  ownerUserId: string;
  ownerEmail?: string | null;
}): Promise<ProjectRow | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const id = generateId();
  const { rows } = await p.query<{
    id: string;
    name: string;
    owner_user_id: string;
    created_at: string;
    reference_track_url: string | null;
    reference_track_name: string | null;
    reference_track_duration_sec: number | null;
  }>(
    `INSERT INTO projects (id, name, owner_user_id) VALUES ($1, $2, $3) RETURNING *`,
    [id, args.name.slice(0, 200), args.ownerUserId],
  );
  if (!rows[0]) return null;
  await p.query(
    `INSERT INTO project_members (project_id, user_id, email, role, invited_by_user_id)
     VALUES ($1, $2, $3, 'producer', $2)
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [id, args.ownerUserId, args.ownerEmail ?? null],
  );
  return {
    id: rows[0].id,
    name: rows[0].name,
    ownerUserId: rows[0].owner_user_id,
    createdAt: rows[0].created_at,
    referenceTrackUrl: rows[0].reference_track_url,
    referenceTrackName: rows[0].reference_track_name,
    referenceTrackDurationSec: rows[0].reference_track_duration_sec,
  };
}

export async function updateProjectReferenceTrack(args: {
  projectId: string;
  ownerUserId: string;
  url: string | null;
  name: string | null;
  durationSec: number | null;
}): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  await ensureSchema();
  const { rowCount } = await p.query(
    `UPDATE projects
     SET reference_track_url = $3, reference_track_name = $4, reference_track_duration_sec = $5
     WHERE id = $1 AND owner_user_id = $2`,
    [args.projectId, args.ownerUserId, args.url, args.name, args.durationSec],
  );
  return (rowCount ?? 0) > 0;
}

export async function getProjectReferenceTrack(projectId: string): Promise<{
  url: string | null;
  name: string | null;
  durationSec: number | null;
} | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const { rows } = await p.query<{
    reference_track_url: string | null;
    reference_track_name: string | null;
    reference_track_duration_sec: number | null;
  }>(`SELECT reference_track_url, reference_track_name, reference_track_duration_sec FROM projects WHERE id = $1`, [projectId]);
  const row = rows[0];
  if (!row) return null;
  return {
    url: row.reference_track_url,
    name: row.reference_track_name,
    durationSec: row.reference_track_duration_sec,
  };
}

export async function listProjectsForUser(userId: string): Promise<
  Array<ProjectRow & { role: ProjectRole; memberCount: number }>
> {
  const p = getPool();
  if (!p) return [];
  await ensureSchema();
  const { rows } = await p.query<{
    id: string;
    name: string;
    owner_user_id: string;
    created_at: string;
    role: string;
    member_count: string | number;
    reference_track_url: string | null;
    reference_track_name: string | null;
    reference_track_duration_sec: number | null;
  }>(
    `SELECT p.id, p.name, p.owner_user_id, p.created_at, m.role,
            p.reference_track_url, p.reference_track_name, p.reference_track_duration_sec,
            (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) AS member_count
     FROM projects p
     INNER JOIN project_members m ON m.project_id = p.id AND m.user_id = $1
     ORDER BY p.created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    ownerUserId: r.owner_user_id,
    createdAt: r.created_at,
    referenceTrackUrl: r.reference_track_url,
    referenceTrackName: r.reference_track_name,
    referenceTrackDurationSec: r.reference_track_duration_sec,
    role: normalizeRole(r.role),
    memberCount: Number(r.member_count),
  }));
}

export async function getProjectMembership(
  projectId: string,
  userId: string,
): Promise<ProjectMemberRow | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const { rows } = await p.query<{
    project_id: string;
    user_id: string;
    email: string | null;
    role: string;
    invited_by_user_id: string | null;
    joined_at: string;
  }>(
    `SELECT * FROM project_members WHERE project_id = $1 AND user_id = $2`,
    [projectId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    projectId: row.project_id,
    userId: row.user_id,
    email: row.email,
    role: normalizeRole(row.role),
    invitedByUserId: row.invited_by_user_id,
    joinedAt: row.joined_at,
  };
}

export async function getProjectWithMembers(
  projectId: string,
  viewerUserId: string,
): Promise<{ project: ProjectRow; members: ProjectMemberRow[]; viewerRole: ProjectRole } | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const viewer = await getProjectMembership(projectId, viewerUserId);
  if (!viewer) return null;
  const { rows: projectRows } = await p.query<{
    id: string;
    name: string;
    owner_user_id: string;
    created_at: string;
    reference_track_url: string | null;
    reference_track_name: string | null;
    reference_track_duration_sec: number | null;
  }>(`SELECT * FROM projects WHERE id = $1`, [projectId]);
  if (!projectRows[0]) return null;
  const { rows: memberRows } = await p.query<{
    project_id: string;
    user_id: string;
    email: string | null;
    role: string;
    invited_by_user_id: string | null;
    joined_at: string;
  }>(`SELECT * FROM project_members WHERE project_id = $1 ORDER BY joined_at ASC`, [projectId]);
  return {
    project: {
      id: projectRows[0].id,
      name: projectRows[0].name,
      ownerUserId: projectRows[0].owner_user_id,
      createdAt: projectRows[0].created_at,
      referenceTrackUrl: projectRows[0].reference_track_url,
      referenceTrackName: projectRows[0].reference_track_name,
      referenceTrackDurationSec: projectRows[0].reference_track_duration_sec,
    },
    members: memberRows.map((r) => ({
      projectId: r.project_id,
      userId: r.user_id,
      email: r.email,
      role: normalizeRole(r.role),
      invitedByUserId: r.invited_by_user_id,
      joinedAt: r.joined_at,
    })),
    viewerRole: viewer.role,
  };
}

export async function addProjectMember(args: {
  projectId: string;
  userId: string;
  email?: string | null;
  role: ProjectRole;
  invitedByUserId: string;
}): Promise<ProjectMemberRow | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const role = ROLES.includes(args.role) ? args.role : "observer";
  const { rows } = await p.query<{
    project_id: string;
    user_id: string;
    email: string | null;
    role: string;
    invited_by_user_id: string | null;
    joined_at: string;
  }>(
    `INSERT INTO project_members (project_id, user_id, email, role, invited_by_user_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role, email = COALESCE(EXCLUDED.email, project_members.email)
     RETURNING *`,
    [args.projectId, args.userId, args.email ?? null, role, args.invitedByUserId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    projectId: row.project_id,
    userId: row.user_id,
    email: row.email,
    role: normalizeRole(row.role),
    invitedByUserId: row.invited_by_user_id,
    joinedAt: row.joined_at,
  };
}

export async function upsertPendingInvite(args: {
  projectId: string;
  email: string;
  role: ProjectRole;
  invitedByUserId: string;
}): Promise<{ id: string; createdAt: string }> {
  const p = getPool();
  if (!p) throw new Error("Database not available");
  await ensureSchema();
  const id = `inv_${crypto.randomBytes(12).toString("base64url")}`;
  const role = ROLES.includes(args.role) ? args.role : "observer";
  const { rows } = await p.query<{ id: string; created_at: string }>(
    `INSERT INTO pending_project_invites (id, project_id, email, role, invited_by_user_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (project_id, email) DO UPDATE SET
       role = EXCLUDED.role,
       invited_by_user_id = EXCLUDED.invited_by_user_id,
       created_at = NOW(),
       expires_at = NOW() + INTERVAL '14 days'
     RETURNING id, created_at`,
    [id, args.projectId, args.email.toLowerCase(), role, args.invitedByUserId],
  );
  return { id: rows[0].id, createdAt: rows[0].created_at };
}

export async function applyPendingInvitesForEmail(args: {
  userId: string;
  email: string;
}): Promise<number> {
  const p = getPool();
  if (!p) return 0;
  await ensureSchema();
  const email = args.email.toLowerCase();
  const { rows } = await p.query<{ project_id: string; role: string; invited_by_user_id: string }>(
    `SELECT project_id, role, invited_by_user_id
     FROM pending_project_invites
     WHERE email = $1 AND expires_at > NOW()`,
    [email],
  );
  for (const row of rows) {
    await addProjectMember({
      projectId: row.project_id,
      userId: args.userId,
      email,
      role: normalizeRole(row.role),
      invitedByUserId: row.invited_by_user_id,
    });
  }
  if (rows.length > 0) {
    await p.query(`DELETE FROM pending_project_invites WHERE email = $1`, [email]);
  }
  return rows.length;
}

export async function removeProjectMember(args: {
  projectId: string;
  userId: string;
}): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  await ensureSchema();
  const { rowCount } = await p.query(
    `DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`,
    [args.projectId, args.userId],
  );
  return (rowCount ?? 0) > 0;
}
