import { Pool } from "pg";

let pool: Pool | null = null;
let ensured = false;

function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  }
  return pool;
}

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "daniel@creatorhubn.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export type UserStatus = "pending" | "approved" | "admin" | "banned";

export type UserRow = {
  userId: string;
  email: string | null;
  status: UserStatus;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  pilotExpiresAt: string | null;
};

async function ensureSchema(): Promise<void> {
  if (ensured) return;
  const p = getPool();
  if (!p) return;
  await p.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      user_id TEXT PRIMARY KEY,
      email TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      approved_at TIMESTAMPTZ,
      approved_by TEXT,
      metadata JSONB
    );
    CREATE INDEX IF NOT EXISTS app_users_status_idx ON app_users (status);
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS pilot_expires_at TIMESTAMPTZ;
  `);
  ensured = true;
}

export async function recordUserSeen(args: { userId: string; email: string | null }): Promise<UserRow | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const emailLower = args.email ? args.email.toLowerCase() : null;
  const status = emailLower && ADMIN_EMAILS.includes(emailLower) ? "admin" : "pending";
  await p.query(
    `INSERT INTO app_users (user_id, email, status, approved_at, approved_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, app_users.email),
       status = CASE
         WHEN app_users.status = 'banned' THEN app_users.status
         WHEN $3 = 'admin' THEN 'admin'
         ELSE app_users.status
       END,
       approved_at = COALESCE(app_users.approved_at, EXCLUDED.approved_at),
       approved_by = COALESCE(app_users.approved_by, EXCLUDED.approved_by)`,
    [args.userId, args.email, status, status === "admin" ? new Date().toISOString() : null, status === "admin" ? "system:admin-email" : null],
  );
  return getUser(args.userId);
}

function effectiveStatus(
  status: UserStatus,
  pilotExpiresAt: string | null,
): UserStatus {
  if (status === "approved" && pilotExpiresAt) {
    const expires = Date.parse(pilotExpiresAt);
    if (Number.isFinite(expires) && expires < Date.now()) {
      return "pending";
    }
  }
  return status;
}

export async function getUser(userId: string): Promise<UserRow | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const { rows } = await p.query<{
    user_id: string;
    email: string | null;
    status: UserStatus;
    created_at: string;
    approved_at: string | null;
    approved_by: string | null;
    pilot_expires_at: string | null;
  }>(
    `SELECT user_id, email, status, created_at, approved_at, approved_by, pilot_expires_at
     FROM app_users WHERE user_id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    email: row.email,
    status: effectiveStatus(row.status, row.pilot_expires_at),
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    pilotExpiresAt: row.pilot_expires_at,
  };
}

export async function listUsers(): Promise<UserRow[]> {
  const p = getPool();
  if (!p) return [];
  await ensureSchema();
  const { rows } = await p.query<{
    user_id: string;
    email: string | null;
    status: UserStatus;
    created_at: string;
    approved_at: string | null;
    approved_by: string | null;
    pilot_expires_at: string | null;
  }>(
    `SELECT user_id, email, status, created_at, approved_at, approved_by, pilot_expires_at
     FROM app_users
     ORDER BY status = 'pending' DESC, created_at DESC`,
  );
  return rows.map((row) => ({
    userId: row.user_id,
    email: row.email,
    status: effectiveStatus(row.status, row.pilot_expires_at),
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    pilotExpiresAt: row.pilot_expires_at,
  }));
}

export async function setUserStatus(args: {
  targetUserId: string;
  status: UserStatus;
  actingUserId: string;
  pilotExpiresAt?: string | null; // ISO timestamp or null to clear
}): Promise<void> {
  const p = getPool();
  if (!p) return;
  await ensureSchema();
  const isApproval = args.status === "approved" || args.status === "admin";
  await p.query(
    `UPDATE app_users SET
        status = $2,
        approved_at = CASE WHEN $3 THEN COALESCE(approved_at, NOW()) ELSE approved_at END,
        approved_by = CASE WHEN $3 THEN COALESCE(approved_by, $4) ELSE approved_by END,
        pilot_expires_at = CASE
          WHEN $5::boolean THEN $6::timestamptz
          WHEN $2 = 'pending' OR $2 = 'banned' THEN NULL
          ELSE pilot_expires_at
        END
     WHERE user_id = $1`,
    [
      args.targetUserId,
      args.status,
      isApproval,
      args.actingUserId,
      args.pilotExpiresAt !== undefined,
      args.pilotExpiresAt ?? null,
    ],
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
