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
  `);
  ensured = true;
}

export type ProjectRow = {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
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
  const { rows } = await p.query<{ id: string; name: string; owner_user_id: string; created_at: string }>(
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
  }>(
    `SELECT p.id, p.name, p.owner_user_id, p.created_at, m.role,
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
