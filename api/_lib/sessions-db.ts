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

async function ensureSchema(): Promise<void> {
  if (ensured) return;
  const p = getPool();
  if (!p) return;
  await p.query(`
    CREATE TABLE IF NOT EXISTS live_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      external_track_id TEXT,
      started_by_user_id TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE INDEX IF NOT EXISTS live_sessions_project_idx ON live_sessions (project_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS live_session_participants (
      session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      display_name TEXT,
      project_role TEXT,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      mic_armed BOOLEAN NOT NULL DEFAULT FALSE,
      recording BOOLEAN NOT NULL DEFAULT FALSE,
      PRIMARY KEY (session_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS live_participants_heartbeat_idx ON live_session_participants (session_id, last_heartbeat_at DESC);
  `);
  ensured = true;
}

export type LiveSessionRow = {
  id: string;
  projectId: string;
  externalTrackId: string | null;
  startedByUserId: string;
  startedAt: string;
  endedAt: string | null;
  status: "active" | "ended";
};

export type LiveParticipantRow = {
  sessionId: string;
  userId: string;
  displayName: string | null;
  projectRole: string | null;
  joinedAt: string;
  lastHeartbeatAt: string;
  micArmed: boolean;
  recording: boolean;
  isOnline: boolean;
};

const ONLINE_WINDOW_SEC = 15;

export async function createLiveSession(args: {
  projectId: string;
  externalTrackId?: string | null;
  startedByUserId: string;
}): Promise<LiveSessionRow | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  // End any prior active session for this project so there's only one live.
  await p.query(
    `UPDATE live_sessions SET status = 'ended', ended_at = NOW()
     WHERE project_id = $1 AND status = 'active'`,
    [args.projectId],
  );
  const id = `lsess_${crypto.randomBytes(9).toString("base64url")}`;
  const { rows } = await p.query<{
    id: string;
    project_id: string;
    external_track_id: string | null;
    started_by_user_id: string;
    started_at: string;
    ended_at: string | null;
    status: LiveSessionRow["status"];
  }>(
    `INSERT INTO live_sessions (id, project_id, external_track_id, started_by_user_id)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, args.projectId, args.externalTrackId ?? null, args.startedByUserId],
  );
  return rows[0] ? mapSession(rows[0]) : null;
}

export async function endLiveSession(args: {
  sessionId: string;
  userId: string;
}): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  await ensureSchema();
  const { rowCount } = await p.query(
    `UPDATE live_sessions SET status = 'ended', ended_at = NOW()
     WHERE id = $1 AND started_by_user_id = $2 AND status = 'active'`,
    [args.sessionId, args.userId],
  );
  return (rowCount ?? 0) > 0;
}

export async function getActiveSessionForProject(
  projectId: string,
): Promise<LiveSessionRow | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const { rows } = await p.query<{
    id: string;
    project_id: string;
    external_track_id: string | null;
    started_by_user_id: string;
    started_at: string;
    ended_at: string | null;
    status: LiveSessionRow["status"];
  }>(
    `SELECT * FROM live_sessions WHERE project_id = $1 AND status = 'active'
     ORDER BY started_at DESC LIMIT 1`,
    [projectId],
  );
  return rows[0] ? mapSession(rows[0]) : null;
}

export async function getLiveSession(sessionId: string): Promise<LiveSessionRow | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const { rows } = await p.query<{
    id: string;
    project_id: string;
    external_track_id: string | null;
    started_by_user_id: string;
    started_at: string;
    ended_at: string | null;
    status: LiveSessionRow["status"];
  }>(`SELECT * FROM live_sessions WHERE id = $1`, [sessionId]);
  return rows[0] ? mapSession(rows[0]) : null;
}

export async function upsertParticipant(args: {
  sessionId: string;
  userId: string;
  displayName?: string | null;
  projectRole?: string | null;
}): Promise<void> {
  const p = getPool();
  if (!p) return;
  await ensureSchema();
  await p.query(
    `INSERT INTO live_session_participants (session_id, user_id, display_name, project_role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (session_id, user_id) DO UPDATE SET
       display_name = COALESCE(EXCLUDED.display_name, live_session_participants.display_name),
       project_role = COALESCE(EXCLUDED.project_role, live_session_participants.project_role),
       last_heartbeat_at = NOW()`,
    [args.sessionId, args.userId, args.displayName ?? null, args.projectRole ?? null],
  );
}

export async function recordHeartbeat(args: {
  sessionId: string;
  userId: string;
  micArmed?: boolean;
  recording?: boolean;
}): Promise<void> {
  const p = getPool();
  if (!p) return;
  await ensureSchema();
  const sets: string[] = ["last_heartbeat_at = NOW()"];
  const values: unknown[] = [args.sessionId, args.userId];
  if (typeof args.micArmed === "boolean") {
    values.push(args.micArmed);
    sets.push(`mic_armed = $${values.length}`);
  }
  if (typeof args.recording === "boolean") {
    values.push(args.recording);
    sets.push(`recording = $${values.length}`);
  }
  await p.query(
    `UPDATE live_session_participants SET ${sets.join(", ")}
     WHERE session_id = $1 AND user_id = $2`,
    values,
  );
}

export async function leaveParticipant(args: {
  sessionId: string;
  userId: string;
}): Promise<void> {
  const p = getPool();
  if (!p) return;
  await ensureSchema();
  await p.query(
    `DELETE FROM live_session_participants WHERE session_id = $1 AND user_id = $2`,
    [args.sessionId, args.userId],
  );
}

export async function listParticipants(sessionId: string): Promise<LiveParticipantRow[]> {
  const p = getPool();
  if (!p) return [];
  await ensureSchema();
  const { rows } = await p.query<{
    session_id: string;
    user_id: string;
    display_name: string | null;
    project_role: string | null;
    joined_at: string;
    last_heartbeat_at: string;
    mic_armed: boolean;
    recording: boolean;
  }>(
    `SELECT * FROM live_session_participants
     WHERE session_id = $1 ORDER BY joined_at ASC`,
    [sessionId],
  );
  const now = Date.now();
  return rows.map((r) => ({
    sessionId: r.session_id,
    userId: r.user_id,
    displayName: r.display_name,
    projectRole: r.project_role,
    joinedAt: r.joined_at,
    lastHeartbeatAt: r.last_heartbeat_at,
    micArmed: r.mic_armed,
    recording: r.recording,
    isOnline: now - new Date(r.last_heartbeat_at).getTime() < ONLINE_WINDOW_SEC * 1000,
  }));
}

function mapSession(row: {
  id: string;
  project_id: string;
  external_track_id: string | null;
  started_by_user_id: string;
  started_at: string;
  ended_at: string | null;
  status: LiveSessionRow["status"];
}): LiveSessionRow {
  return {
    id: row.id,
    projectId: row.project_id,
    externalTrackId: row.external_track_id,
    startedByUserId: row.started_by_user_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
  };
}
