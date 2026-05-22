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
    ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS bpm INTEGER;
    ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS recording_armed_at TIMESTAMPTZ;
    ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS recording_starts_at TIMESTAMPTZ;
    ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS recording_stopped_at TIMESTAMPTZ;
    ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS click_on BOOLEAN NOT NULL DEFAULT FALSE;

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
    ALTER TABLE live_session_participants ADD COLUMN IF NOT EXISTS level_db REAL;
    ALTER TABLE live_session_participants ADD COLUMN IF NOT EXISTS peak_db REAL;
    ALTER TABLE live_session_participants ADD COLUMN IF NOT EXISTS waveform_peaks JSONB;
    ALTER TABLE live_session_participants ADD COLUMN IF NOT EXISTS level_updated_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS live_session_signals (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      from_user_id TEXT NOT NULL,
      to_user_id TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      consumed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS live_signals_inbox_idx ON live_session_signals (session_id, to_user_id, consumed_at);
  `);
  ensured = true;
}

export type SignalType = "offer" | "answer" | "ice" | "bye";

export type SignalRow = {
  id: string;
  sessionId: string;
  fromUserId: string;
  toUserId: string;
  signalType: SignalType;
  payload: unknown;
  createdAt: string;
};

export async function postSignal(args: {
  sessionId: string;
  fromUserId: string;
  toUserId: string;
  signalType: SignalType;
  payload: unknown;
}): Promise<void> {
  const p = getPool();
  if (!p) return;
  const id = `sig_${crypto.randomBytes(9).toString("base64url")}`;
  await p.query(
    `INSERT INTO live_session_signals (id, session_id, from_user_id, to_user_id, signal_type, payload)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, args.sessionId, args.fromUserId, args.toUserId, args.signalType, JSON.stringify(args.payload)],
  );
}

export async function consumeSignals(args: {
  sessionId: string;
  toUserId: string;
}): Promise<SignalRow[]> {
  const p = getPool();
  if (!p) return [];
  const { rows } = await p.query<{
    id: string;
    session_id: string;
    from_user_id: string;
    to_user_id: string;
    signal_type: string;
    payload: unknown;
    created_at: string;
  }>(
    `UPDATE live_session_signals
     SET consumed_at = NOW()
     WHERE session_id = $1 AND to_user_id = $2 AND consumed_at IS NULL
     RETURNING *`,
    [args.sessionId, args.toUserId],
  );
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    fromUserId: r.from_user_id,
    toUserId: r.to_user_id,
    signalType: r.signal_type as SignalType,
    payload: r.payload,
    createdAt: r.created_at,
  }));
}

export type LiveSessionRow = {
  id: string;
  projectId: string;
  externalTrackId: string | null;
  startedByUserId: string;
  startedAt: string;
  endedAt: string | null;
  status: "active" | "ended";
  bpm: number | null;
  recordingArmedAt: string | null;
  recordingStartsAt: string | null;
  recordingStoppedAt: string | null;
  clickOn: boolean;
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
  levelDb: number | null;
  peakDb: number | null;
  waveformPeaks: number[] | null;
  levelUpdatedAt: string | null;
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
    bpm: number | null;
    recording_armed_at: string | null;
    recording_starts_at: string | null;
    recording_stopped_at: string | null;
    click_on: boolean;
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
    bpm: number | null;
    recording_armed_at: string | null;
    recording_starts_at: string | null;
    recording_stopped_at: string | null;
    click_on: boolean;
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
    bpm: number | null;
    recording_armed_at: string | null;
    recording_starts_at: string | null;
    recording_stopped_at: string | null;
    click_on: boolean;
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

export async function updateParticipantLevel(args: {
  sessionId: string;
  userId: string;
  levelDb: number;
  peakDb: number;
  waveformPeaks: number[];
}): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(
    `UPDATE live_session_participants SET
       level_db = $3, peak_db = $4, waveform_peaks = $5, level_updated_at = NOW()
     WHERE session_id = $1 AND user_id = $2`,
    [args.sessionId, args.userId, args.levelDb, args.peakDb, JSON.stringify(args.waveformPeaks.slice(-200))],
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
    level_db: number | null;
    peak_db: number | null;
    waveform_peaks: number[] | null;
    level_updated_at: string | null;
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
    levelDb: r.level_db,
    peakDb: r.peak_db,
    waveformPeaks: Array.isArray(r.waveform_peaks) ? r.waveform_peaks : null,
    levelUpdatedAt: r.level_updated_at,
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
  bpm: number | null;
  recording_armed_at: string | null;
  recording_starts_at: string | null;
  recording_stopped_at: string | null;
  click_on: boolean;
}): LiveSessionRow {
  return {
    id: row.id,
    projectId: row.project_id,
    externalTrackId: row.external_track_id,
    startedByUserId: row.started_by_user_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
    bpm: row.bpm,
    recordingArmedAt: row.recording_armed_at,
    recordingStartsAt: row.recording_starts_at,
    recordingStoppedAt: row.recording_stopped_at,
    clickOn: Boolean(row.click_on),
  };
}

export async function armRecording(args: {
  sessionId: string;
  userId: string;
  countdownSec: number;
  bpm?: number;
  clickOn?: boolean;
}): Promise<LiveSessionRow | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const startsAt = new Date(Date.now() + args.countdownSec * 1000).toISOString();
  const { rows } = await p.query<{
    id: string;
    project_id: string;
    external_track_id: string | null;
    started_by_user_id: string;
    started_at: string;
    ended_at: string | null;
    status: LiveSessionRow["status"];
    bpm: number | null;
    recording_armed_at: string | null;
    recording_starts_at: string | null;
    recording_stopped_at: string | null;
    click_on: boolean;
  }>(
    `UPDATE live_sessions SET
       recording_armed_at = NOW(),
       recording_starts_at = $3,
       recording_stopped_at = NULL,
       bpm = COALESCE($4, bpm),
       click_on = COALESCE($5, click_on)
     WHERE id = $1 AND started_by_user_id = $2 AND status = 'active'
     RETURNING *`,
    [
      args.sessionId,
      args.userId,
      startsAt,
      args.bpm ?? null,
      typeof args.clickOn === "boolean" ? args.clickOn : null,
    ],
  );
  return rows[0] ? mapSession(rows[0]) : null;
}

export async function stopRecording(args: {
  sessionId: string;
  userId: string;
}): Promise<LiveSessionRow | null> {
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
    bpm: number | null;
    recording_armed_at: string | null;
    recording_starts_at: string | null;
    recording_stopped_at: string | null;
    click_on: boolean;
  }>(
    `UPDATE live_sessions SET recording_stopped_at = NOW(), recording_armed_at = NULL, recording_starts_at = NULL
     WHERE id = $1 AND started_by_user_id = $2 AND status = 'active'
     RETURNING *`,
    [args.sessionId, args.userId],
  );
  return rows[0] ? mapSession(rows[0]) : null;
}

export async function updateSessionBpm(args: {
  sessionId: string;
  userId: string;
  bpm: number;
  clickOn?: boolean;
}): Promise<void> {
  const p = getPool();
  if (!p) return;
  await ensureSchema();
  await p.query(
    `UPDATE live_sessions SET bpm = $3, click_on = COALESCE($4, click_on)
     WHERE id = $1 AND started_by_user_id = $2 AND status = 'active'`,
    [args.sessionId, args.userId, args.bpm, typeof args.clickOn === "boolean" ? args.clickOn : null],
  );
}
