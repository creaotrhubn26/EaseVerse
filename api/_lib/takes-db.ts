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

export async function ensureTakesSchema(): Promise<void> {
  return ensureSchema();
}

async function ensureSchema(): Promise<void> {
  if (ensured) return;
  const p = getPool();
  if (!p) return;
  await p.query(`
    CREATE TABLE IF NOT EXISTS takes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      external_track_id TEXT,
      source_path TEXT,
      filename TEXT NOT NULL,
      byte_size BIGINT,
      duration_sec REAL,
      storage_url TEXT NOT NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'queued',
      error_message TEXT,
      producer_note TEXT,
      producer_decision TEXT
    );
    ALTER TABLE takes ADD COLUMN IF NOT EXISTS producer_note TEXT;
    ALTER TABLE takes ADD COLUMN IF NOT EXISTS producer_decision TEXT;
    ALTER TABLE takes ADD COLUMN IF NOT EXISTS producer_memo_url TEXT;
    ALTER TABLE takes ADD COLUMN IF NOT EXISTS producer_memo_duration_sec REAL;
    ALTER TABLE takes ADD COLUMN IF NOT EXISTS decision_locked_at TIMESTAMPTZ;
    ALTER TABLE takes ADD COLUMN IF NOT EXISTS lyrics_snapshot TEXT;
    ALTER TABLE takes ADD COLUMN IF NOT EXISTS lyrics_snapshot_at TIMESTAMPTZ;
    ALTER TABLE takes ADD COLUMN IF NOT EXISTS project_id TEXT;
    CREATE INDEX IF NOT EXISTS takes_project_idx ON takes (project_id);

    CREATE TABLE IF NOT EXISTS take_consensus_votes (
      take_id TEXT NOT NULL REFERENCES takes(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      vote TEXT NOT NULL CHECK (vote IN ('agree','disagree')),
      comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (take_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS take_consensus_votes_take_idx ON take_consensus_votes (take_id);

    CREATE TABLE IF NOT EXISTS take_regions (
      id TEXT PRIMARY KEY,
      take_id TEXT NOT NULL REFERENCES takes(id) ON DELETE CASCADE,
      start_sec REAL NOT NULL,
      end_sec REAL NOT NULL,
      label TEXT,
      color TEXT,
      auto_loop BOOLEAN NOT NULL DEFAULT FALSE,
      created_by_user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS take_regions_take_idx ON take_regions (take_id);

    CREATE TABLE IF NOT EXISTS session_checkpoints (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      external_track_id TEXT,
      user_id TEXT NOT NULL,
      source TEXT NOT NULL,
      payload JSONB NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS session_checkpoints_project_idx ON session_checkpoints (project_id, captured_at DESC);
    CREATE INDEX IF NOT EXISTS session_checkpoints_track_idx ON session_checkpoints (external_track_id, captured_at DESC);

    CREATE TABLE IF NOT EXISTS comps (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      external_track_id TEXT,
      name TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS comps_track_idx ON comps (external_track_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS comps_project_idx ON comps (project_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS comp_segments (
      id TEXT PRIMARY KEY,
      comp_id TEXT NOT NULL REFERENCES comps(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      take_id TEXT NOT NULL REFERENCES takes(id) ON DELETE CASCADE,
      start_sec REAL NOT NULL,
      end_sec REAL NOT NULL,
      section_label TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS comp_segments_comp_idx ON comp_segments (comp_id, ordinal);
    CREATE INDEX IF NOT EXISTS comp_segments_take_idx ON comp_segments (take_id);
    CREATE INDEX IF NOT EXISTS takes_user_uploaded_idx ON takes (user_id, uploaded_at DESC);
    CREATE INDEX IF NOT EXISTS takes_status_idx ON takes (status);

    CREATE TABLE IF NOT EXISTS take_analyses (
      take_id TEXT PRIMARY KEY REFERENCES takes(id) ON DELETE CASCADE,
      transcript TEXT,
      pitch_mean_hz REAL,
      pitch_stddev_cents REAL,
      vibrato_rate_hz REAL,
      energy_avg_db REAL,
      energy_stddev_db REAL,
      timing_score INTEGER,
      pronunciation_score INTEGER,
      ai_notes TEXT,
      best_take_in_group BOOLEAN DEFAULT FALSE,
      processed_at TIMESTAMPTZ
    );
    ALTER TABLE take_analyses ADD COLUMN IF NOT EXISTS transcript_words JSONB;
  `);
  ensured = true;
}

export type ProducerDecision = "keeper" | "redo" | null;

export type TakeRow = {
  id: string;
  userId: string;
  externalTrackId: string | null;
  sourcePath: string | null;
  filename: string;
  byteSize: number | null;
  durationSec: number | null;
  storageUrl: string;
  uploadedAt: string;
  status: "queued" | "processing" | "done" | "error";
  errorMessage: string | null;
  producerNote: string | null;
  producerDecision: ProducerDecision;
  producerMemoUrl: string | null;
  producerMemoDurationSec: number | null;
  decisionLockedAt: string | null;
  projectId: string | null;
  lyricsSnapshot: string | null;
  lyricsSnapshotAt: string | null;
};

export type ConsensusVote = "agree" | "disagree";

export type ConsensusTally = {
  takeId: string;
  agree: number;
  disagree: number;
  votes: Array<{ userId: string; vote: ConsensusVote; comment: string | null; createdAt: string }>;
  myVote: ConsensusVote | null;
};

export type TakeAnalysisRow = {
  takeId: string;
  transcript: string | null;
  transcriptWords: Array<{ word: string; start: number; end: number }> | null;
  pitchMeanHz: number | null;
  pitchStddevCents: number | null;
  vibratoRateHz: number | null;
  energyAvgDb: number | null;
  energyStddevDb: number | null;
  timingScore: number | null;
  pronunciationScore: number | null;
  aiNotes: string | null;
  bestTakeInGroup: boolean;
  processedAt: string | null;
};

export async function createTake(args: {
  id: string;
  userId: string;
  externalTrackId?: string | null;
  sourcePath?: string | null;
  filename: string;
  byteSize?: number;
  storageUrl: string;
  projectId?: string | null;
  lyricsSnapshot?: string | null;
}): Promise<TakeRow | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const { rows } = await p.query<TakeRowDb>(
    `INSERT INTO takes
      (id, user_id, external_track_id, source_path, filename, byte_size, storage_url, project_id, lyrics_snapshot, lyrics_snapshot_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9 IS NULL THEN NULL ELSE NOW() END)
     RETURNING *`,
    [
      args.id,
      args.userId,
      args.externalTrackId ?? null,
      args.sourcePath ?? null,
      args.filename,
      args.byteSize ?? null,
      args.storageUrl,
      args.projectId ?? null,
      args.lyricsSnapshot ?? null,
    ],
  );
  return rows[0] ? mapTakeRow(rows[0]) : null;
}

export async function getTakeById(takeId: string): Promise<TakeRow | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const { rows } = await p.query<TakeRowDb>(`SELECT * FROM takes WHERE id = $1`, [takeId]);
  return rows[0] ? mapTakeRow(rows[0]) : null;
}

export async function listKeeperTakes(userId: string, limit = 200): Promise<TakeRow[]> {
  const p = getPool();
  if (!p) return [];
  await ensureSchema();
  const { rows } = await p.query<TakeRowDb>(
    `SELECT * FROM takes
     WHERE user_id = $1 AND producer_decision = 'keeper'
     ORDER BY uploaded_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map(mapTakeRow);
}

export async function listTakesForGroup(
  userId: string,
  externalTrackId: string,
): Promise<Array<TakeRow & { analysis: TakeAnalysisRow | null }>> {
  const p = getPool();
  if (!p) return [];
  await ensureSchema();
  const { rows } = await p.query<TakeRowDb & {
    analysis_take_id: string | null;
    transcript: string | null;
    pitch_mean_hz: number | null;
    pitch_stddev_cents: number | null;
    vibrato_rate_hz: number | null;
    energy_avg_db: number | null;
    energy_stddev_db: number | null;
    timing_score: number | null;
    pronunciation_score: number | null;
    ai_notes: string | null;
    best_take_in_group: boolean | null;
    processed_at: string | null;
  }>(
    `SELECT t.*,
            a.take_id AS analysis_take_id,
            a.transcript, a.pitch_mean_hz, a.pitch_stddev_cents,
            a.vibrato_rate_hz, a.energy_avg_db, a.energy_stddev_db,
            a.timing_score, a.pronunciation_score, a.ai_notes,
            a.best_take_in_group, a.processed_at
     FROM takes t
     LEFT JOIN take_analyses a ON a.take_id = t.id
     WHERE t.user_id = $1 AND t.external_track_id = $2
     ORDER BY t.uploaded_at ASC`,
    [userId, externalTrackId],
  );
  return rows.map((row) => {
    const take = mapTakeRow(row);
    if (!row.analysis_take_id) return { ...take, analysis: null };
    return {
      ...take,
      analysis: {
        takeId: row.analysis_take_id,
        transcript: row.transcript,
        transcriptWords: null,
        pitchMeanHz: row.pitch_mean_hz,
        pitchStddevCents: row.pitch_stddev_cents,
        vibratoRateHz: row.vibrato_rate_hz,
        energyAvgDb: row.energy_avg_db,
        energyStddevDb: row.energy_stddev_db,
        timingScore: row.timing_score,
        pronunciationScore: row.pronunciation_score,
        aiNotes: row.ai_notes,
        bestTakeInGroup: Boolean(row.best_take_in_group),
        processedAt: row.processed_at,
      },
    };
  });
}

export async function setBestTakeFlags(
  externalTrackId: string,
  userId: string,
  bestTakeId: string,
): Promise<void> {
  const p = getPool();
  if (!p) return;
  await ensureSchema();
  await p.query(
    `UPDATE take_analyses
     SET best_take_in_group = (take_id = $1)
     WHERE take_id IN (
       SELECT id FROM takes WHERE user_id = $2 AND external_track_id = $3
     )`,
    [bestTakeId, userId, externalTrackId],
  );
}

export async function listTakesForUser(userId: string, limit = 50): Promise<TakeRow[]> {
  const p = getPool();
  if (!p) return [];
  await ensureSchema();
  const { rows } = await p.query<TakeRowDb>(
    `SELECT * FROM takes WHERE user_id = $1 ORDER BY uploaded_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map(mapTakeRow);
}

export async function getTakeWithAnalysis(takeId: string): Promise<
  (TakeRow & { analysis: TakeAnalysisRow | null }) | null
> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const { rows } = await p.query<TakeRowDb & {
    analysis_take_id: string | null;
    transcript: string | null;
    transcript_words: Array<{ word: string; start: number; end: number }> | null;
    pitch_mean_hz: number | null;
    pitch_stddev_cents: number | null;
    vibrato_rate_hz: number | null;
    energy_avg_db: number | null;
    energy_stddev_db: number | null;
    timing_score: number | null;
    pronunciation_score: number | null;
    ai_notes: string | null;
    best_take_in_group: boolean | null;
    processed_at: string | null;
  }>(
    `SELECT t.*,
            a.take_id AS analysis_take_id,
            a.transcript, a.transcript_words, a.pitch_mean_hz, a.pitch_stddev_cents,
            a.vibrato_rate_hz, a.energy_avg_db, a.energy_stddev_db,
            a.timing_score, a.pronunciation_score, a.ai_notes,
            a.best_take_in_group, a.processed_at
     FROM takes t
     LEFT JOIN take_analyses a ON a.take_id = t.id
     WHERE t.id = $1`,
    [takeId],
  );
  const row = rows[0];
  if (!row) return null;
  const take = mapTakeRow(row);
  if (!row.analysis_take_id) return { ...take, analysis: null };
  return {
    ...take,
    analysis: {
      takeId: row.analysis_take_id,
      transcript: row.transcript,
      transcriptWords: Array.isArray(row.transcript_words) ? row.transcript_words : null,
      pitchMeanHz: row.pitch_mean_hz,
      pitchStddevCents: row.pitch_stddev_cents,
      vibratoRateHz: row.vibrato_rate_hz,
      energyAvgDb: row.energy_avg_db,
      energyStddevDb: row.energy_stddev_db,
      timingScore: row.timing_score,
      pronunciationScore: row.pronunciation_score,
      aiNotes: row.ai_notes,
      bestTakeInGroup: Boolean(row.best_take_in_group),
      processedAt: row.processed_at,
    },
  };
}

export async function listQueuedTakes(limit = 10): Promise<TakeRow[]> {
  const p = getPool();
  if (!p) return [];
  await ensureSchema();
  const { rows } = await p.query<TakeRowDb>(
    `SELECT * FROM takes WHERE status = 'queued' ORDER BY uploaded_at ASC LIMIT $1`,
    [limit],
  );
  return rows.map(mapTakeRow);
}

export async function markTakeProcessing(takeId: string): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(`UPDATE takes SET status = 'processing' WHERE id = $1`, [takeId]);
}

export async function markTakeDone(takeId: string, durationSec: number | null): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(
    `UPDATE takes SET status = 'done', duration_sec = COALESCE($2, duration_sec) WHERE id = $1`,
    [takeId, durationSec],
  );
}

export async function markTakeError(takeId: string, message: string): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(`UPDATE takes SET status = 'error', error_message = $2 WHERE id = $1`, [takeId, message]);
}

export async function upsertTakeAnalysis(args: Partial<TakeAnalysisRow> & { takeId: string }): Promise<void> {
  const p = getPool();
  if (!p) return;
  await ensureSchema();
  await p.query(
    `INSERT INTO take_analyses
      (take_id, transcript, transcript_words, pitch_mean_hz, pitch_stddev_cents, vibrato_rate_hz,
       energy_avg_db, energy_stddev_db, timing_score, pronunciation_score,
       ai_notes, best_take_in_group, processed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
     ON CONFLICT (take_id) DO UPDATE SET
       transcript = COALESCE(EXCLUDED.transcript, take_analyses.transcript),
       transcript_words = COALESCE(EXCLUDED.transcript_words, take_analyses.transcript_words),
       pitch_mean_hz = COALESCE(EXCLUDED.pitch_mean_hz, take_analyses.pitch_mean_hz),
       pitch_stddev_cents = COALESCE(EXCLUDED.pitch_stddev_cents, take_analyses.pitch_stddev_cents),
       vibrato_rate_hz = COALESCE(EXCLUDED.vibrato_rate_hz, take_analyses.vibrato_rate_hz),
       energy_avg_db = COALESCE(EXCLUDED.energy_avg_db, take_analyses.energy_avg_db),
       energy_stddev_db = COALESCE(EXCLUDED.energy_stddev_db, take_analyses.energy_stddev_db),
       timing_score = COALESCE(EXCLUDED.timing_score, take_analyses.timing_score),
       pronunciation_score = COALESCE(EXCLUDED.pronunciation_score, take_analyses.pronunciation_score),
       ai_notes = COALESCE(EXCLUDED.ai_notes, take_analyses.ai_notes),
       best_take_in_group = COALESCE(EXCLUDED.best_take_in_group, take_analyses.best_take_in_group),
       processed_at = NOW()`,
    [
      args.takeId,
      args.transcript ?? null,
      args.transcriptWords ? JSON.stringify(args.transcriptWords) : null,
      args.pitchMeanHz ?? null,
      args.pitchStddevCents ?? null,
      args.vibratoRateHz ?? null,
      args.energyAvgDb ?? null,
      args.energyStddevDb ?? null,
      args.timingScore ?? null,
      args.pronunciationScore ?? null,
      args.aiNotes ?? null,
      args.bestTakeInGroup ?? false,
    ],
  );
}

type TakeRowDb = {
  id: string;
  user_id: string;
  external_track_id: string | null;
  source_path: string | null;
  filename: string;
  byte_size: string | number | null;
  duration_sec: number | null;
  storage_url: string;
  uploaded_at: string;
  status: TakeRow["status"];
  error_message: string | null;
  producer_note: string | null;
  producer_decision: string | null;
  producer_memo_url: string | null;
  producer_memo_duration_sec: number | null;
  decision_locked_at: string | null;
  project_id: string | null;
  lyrics_snapshot: string | null;
  lyrics_snapshot_at: string | null;
};

function mapTakeRow(row: TakeRowDb): TakeRow {
  return {
    id: row.id,
    userId: row.user_id,
    externalTrackId: row.external_track_id,
    sourcePath: row.source_path,
    filename: row.filename,
    byteSize: row.byte_size === null ? null : Number(row.byte_size),
    durationSec: row.duration_sec,
    storageUrl: row.storage_url,
    uploadedAt: row.uploaded_at,
    status: row.status,
    errorMessage: row.error_message,
    producerNote: row.producer_note,
    producerDecision: normalizeDecision(row.producer_decision),
    producerMemoUrl: row.producer_memo_url,
    producerMemoDurationSec: row.producer_memo_duration_sec,
    decisionLockedAt: row.decision_locked_at,
    projectId: row.project_id,
    lyricsSnapshot: row.lyrics_snapshot,
    lyricsSnapshotAt: row.lyrics_snapshot_at,
  };
}

export async function castConsensusVote(args: {
  takeId: string;
  userId: string;
  vote: ConsensusVote;
  comment?: string | null;
}): Promise<ConsensusTally | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  await p.query(
    `INSERT INTO take_consensus_votes (take_id, user_id, vote, comment)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (take_id, user_id) DO UPDATE SET
       vote = EXCLUDED.vote,
       comment = EXCLUDED.comment,
       created_at = NOW()`,
    [args.takeId, args.userId, args.vote, args.comment ?? null],
  );
  return getConsensusTally(args.takeId, args.userId);
}

export async function clearConsensusVote(args: {
  takeId: string;
  userId: string;
}): Promise<ConsensusTally | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  await p.query(`DELETE FROM take_consensus_votes WHERE take_id = $1 AND user_id = $2`, [
    args.takeId,
    args.userId,
  ]);
  return getConsensusTally(args.takeId, args.userId);
}

export async function getConsensusTally(
  takeId: string,
  viewerUserId: string | null,
): Promise<ConsensusTally> {
  const p = getPool();
  if (!p) return { takeId, agree: 0, disagree: 0, votes: [], myVote: null };
  await ensureSchema();
  const { rows } = await p.query<{
    user_id: string;
    vote: string;
    comment: string | null;
    created_at: string;
  }>(
    `SELECT user_id, vote, comment, created_at
     FROM take_consensus_votes
     WHERE take_id = $1
     ORDER BY created_at ASC`,
    [takeId],
  );
  let agree = 0;
  let disagree = 0;
  let myVote: ConsensusVote | null = null;
  const votes = rows.map((r) => {
    const v = r.vote === "agree" || r.vote === "disagree" ? (r.vote as ConsensusVote) : "agree";
    if (v === "agree") agree++;
    else disagree++;
    if (viewerUserId && r.user_id === viewerUserId) myVote = v;
    return { userId: r.user_id, vote: v, comment: r.comment, createdAt: r.created_at };
  });
  return { takeId, agree, disagree, votes, myVote };
}

export async function lockTakeDecision(args: {
  takeId: string;
  userId: string;
}): Promise<TakeRow | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const { rows } = await p.query<TakeRowDb>(
    `UPDATE takes SET decision_locked_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [args.takeId, args.userId],
  );
  return rows[0] ? mapTakeRow(rows[0]) : null;
}

export type TakeRegion = {
  id: string;
  takeId: string;
  startSec: number;
  endSec: number;
  label: string | null;
  color: string | null;
  autoLoop: boolean;
  createdByUserId: string;
  createdAt: string;
};

type TakeRegionDb = {
  id: string;
  take_id: string;
  start_sec: number;
  end_sec: number;
  label: string | null;
  color: string | null;
  auto_loop: boolean;
  created_by_user_id: string;
  created_at: string;
};

function mapRegion(row: TakeRegionDb): TakeRegion {
  return {
    id: row.id,
    takeId: row.take_id,
    startSec: row.start_sec,
    endSec: row.end_sec,
    label: row.label,
    color: row.color,
    autoLoop: Boolean(row.auto_loop),
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}

export async function createTakeRegion(args: {
  takeId: string;
  startSec: number;
  endSec: number;
  label?: string | null;
  color?: string | null;
  autoLoop?: boolean;
  createdByUserId: string;
}): Promise<TakeRegion | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const id = `rgn_${crypto.randomBytes(9).toString("base64url")}`;
  const start = Math.max(0, args.startSec);
  const end = Math.max(start + 0.05, args.endSec);
  const { rows } = await p.query<TakeRegionDb>(
    `INSERT INTO take_regions
      (id, take_id, start_sec, end_sec, label, color, auto_loop, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      id,
      args.takeId,
      start,
      end,
      args.label?.slice(0, 80) ?? null,
      args.color ?? null,
      args.autoLoop ?? false,
      args.createdByUserId,
    ],
  );
  return rows[0] ? mapRegion(rows[0]) : null;
}

export async function listRegionsForTake(takeId: string): Promise<TakeRegion[]> {
  const p = getPool();
  if (!p) return [];
  await ensureSchema();
  const { rows } = await p.query<TakeRegionDb>(
    `SELECT * FROM take_regions WHERE take_id = $1 ORDER BY start_sec ASC`,
    [takeId],
  );
  return rows.map(mapRegion);
}

export async function listRegionsForTakes(takeIds: string[]): Promise<Map<string, TakeRegion[]>> {
  const map = new Map<string, TakeRegion[]>();
  if (takeIds.length === 0) return map;
  const p = getPool();
  if (!p) return map;
  await ensureSchema();
  const { rows } = await p.query<TakeRegionDb>(
    `SELECT * FROM take_regions WHERE take_id = ANY($1::text[]) ORDER BY start_sec ASC`,
    [takeIds],
  );
  for (const row of rows) {
    const r = mapRegion(row);
    const existing = map.get(r.takeId) ?? [];
    existing.push(r);
    map.set(r.takeId, existing);
  }
  return map;
}

export async function deleteTakeRegion(args: {
  regionId: string;
  userId: string;
  isAdmin?: boolean;
}): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  await ensureSchema();
  const { rowCount } = await p.query(
    args.isAdmin
      ? `DELETE FROM take_regions WHERE id = $1`
      : `DELETE FROM take_regions WHERE id = $1 AND created_by_user_id = $2`,
    args.isAdmin ? [args.regionId] : [args.regionId, args.userId],
  );
  return (rowCount ?? 0) > 0;
}

export async function updateTakeRegionLoop(args: {
  regionId: string;
  userId: string;
  autoLoop: boolean;
}): Promise<TakeRegion | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const { rows } = await p.query<TakeRegionDb>(
    `UPDATE take_regions SET auto_loop = $3
     WHERE id = $1 AND created_by_user_id = $2
     RETURNING *`,
    [args.regionId, args.userId, args.autoLoop],
  );
  return rows[0] ? mapRegion(rows[0]) : null;
}

export type CompRow = {
  id: string;
  projectId: string | null;
  externalTrackId: string | null;
  name: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type CompSegmentRow = {
  id: string;
  compId: string;
  ordinal: number;
  takeId: string;
  startSec: number;
  endSec: number;
  sectionLabel: string | null;
  createdAt: string;
};

export async function createComp(args: {
  projectId?: string | null;
  externalTrackId?: string | null;
  name: string;
  createdByUserId: string;
}): Promise<CompRow | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const id = `cmp_${crypto.randomBytes(9).toString("base64url")}`;
  const { rows } = await p.query<{
    id: string;
    project_id: string | null;
    external_track_id: string | null;
    name: string;
    created_by_user_id: string;
    created_at: string;
    updated_at: string;
  }>(
    `INSERT INTO comps (id, project_id, external_track_id, name, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [id, args.projectId ?? null, args.externalTrackId ?? null, args.name.slice(0, 200), args.createdByUserId],
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    projectId: rows[0].project_id,
    externalTrackId: rows[0].external_track_id,
    name: rows[0].name,
    createdByUserId: rows[0].created_by_user_id,
    createdAt: rows[0].created_at,
    updatedAt: rows[0].updated_at,
  };
}

export async function listCompsForTrack(externalTrackId: string): Promise<CompRow[]> {
  const p = getPool();
  if (!p) return [];
  await ensureSchema();
  const { rows } = await p.query<{
    id: string;
    project_id: string | null;
    external_track_id: string | null;
    name: string;
    created_by_user_id: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT * FROM comps WHERE external_track_id = $1 ORDER BY created_at DESC`,
    [externalTrackId],
  );
  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    externalTrackId: r.external_track_id,
    name: r.name,
    createdByUserId: r.created_by_user_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function getComp(compId: string): Promise<CompRow | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const { rows } = await p.query<{
    id: string;
    project_id: string | null;
    external_track_id: string | null;
    name: string;
    created_by_user_id: string;
    created_at: string;
    updated_at: string;
  }>(`SELECT * FROM comps WHERE id = $1`, [compId]);
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    projectId: rows[0].project_id,
    externalTrackId: rows[0].external_track_id,
    name: rows[0].name,
    createdByUserId: rows[0].created_by_user_id,
    createdAt: rows[0].created_at,
    updatedAt: rows[0].updated_at,
  };
}

export async function listCompSegments(compId: string): Promise<CompSegmentRow[]> {
  const p = getPool();
  if (!p) return [];
  await ensureSchema();
  const { rows } = await p.query<{
    id: string;
    comp_id: string;
    ordinal: number;
    take_id: string;
    start_sec: number;
    end_sec: number;
    section_label: string | null;
    created_at: string;
  }>(`SELECT * FROM comp_segments WHERE comp_id = $1 ORDER BY ordinal ASC`, [compId]);
  return rows.map((r) => ({
    id: r.id,
    compId: r.comp_id,
    ordinal: r.ordinal,
    takeId: r.take_id,
    startSec: r.start_sec,
    endSec: r.end_sec,
    sectionLabel: r.section_label,
    createdAt: r.created_at,
  }));
}

export async function replaceCompSegments(args: {
  compId: string;
  segments: Array<{
    takeId: string;
    startSec: number;
    endSec: number;
    sectionLabel?: string | null;
  }>;
}): Promise<CompSegmentRow[]> {
  const p = getPool();
  if (!p) return [];
  await ensureSchema();
  await p.query(`DELETE FROM comp_segments WHERE comp_id = $1`, [args.compId]);
  const out: CompSegmentRow[] = [];
  for (let i = 0; i < args.segments.length; i++) {
    const seg = args.segments[i];
    const id = `seg_${crypto.randomBytes(9).toString("base64url")}`;
    const { rows } = await p.query<{
      id: string;
      comp_id: string;
      ordinal: number;
      take_id: string;
      start_sec: number;
      end_sec: number;
      section_label: string | null;
      created_at: string;
    }>(
      `INSERT INTO comp_segments (id, comp_id, ordinal, take_id, start_sec, end_sec, section_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, args.compId, i, seg.takeId, seg.startSec, seg.endSec, seg.sectionLabel ?? null],
    );
    if (rows[0]) {
      out.push({
        id: rows[0].id,
        compId: rows[0].comp_id,
        ordinal: rows[0].ordinal,
        takeId: rows[0].take_id,
        startSec: rows[0].start_sec,
        endSec: rows[0].end_sec,
        sectionLabel: rows[0].section_label,
        createdAt: rows[0].created_at,
      });
    }
  }
  await p.query(`UPDATE comps SET updated_at = NOW() WHERE id = $1`, [args.compId]);
  return out;
}

export async function deleteComp(args: { compId: string; userId: string }): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  await ensureSchema();
  const { rowCount } = await p.query(
    `DELETE FROM comps WHERE id = $1 AND created_by_user_id = $2`,
    [args.compId, args.userId],
  );
  return (rowCount ?? 0) > 0;
}

export async function recordSessionCheckpoint(args: {
  userId: string;
  projectId?: string | null;
  externalTrackId?: string | null;
  source: string;
  payload: unknown;
}): Promise<{ id: string; capturedAt: string } | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const id = `chk_${crypto.randomBytes(9).toString("base64url")}`;
  const { rows } = await p.query<{ id: string; captured_at: string }>(
    `INSERT INTO session_checkpoints (id, project_id, external_track_id, user_id, source, payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, captured_at`,
    [
      id,
      args.projectId ?? null,
      args.externalTrackId ?? null,
      args.userId,
      args.source.slice(0, 80),
      JSON.stringify(args.payload),
    ],
  );
  return rows[0] ? { id: rows[0].id, capturedAt: rows[0].captured_at } : null;
}

export async function listRecentCheckpoints(args: {
  projectId?: string;
  externalTrackId?: string;
  limit?: number;
}): Promise<Array<{ id: string; source: string; payload: unknown; capturedAt: string }>> {
  const p = getPool();
  if (!p) return [];
  await ensureSchema();
  const limit = args.limit ?? 20;
  let result: { rows: Array<{ id: string; source: string; payload: unknown; captured_at: string }> };
  if (args.projectId) {
    result = await p.query(
      `SELECT id, source, payload, captured_at FROM session_checkpoints
       WHERE project_id = $1 ORDER BY captured_at DESC LIMIT $2`,
      [args.projectId, limit],
    );
  } else if (args.externalTrackId) {
    result = await p.query(
      `SELECT id, source, payload, captured_at FROM session_checkpoints
       WHERE external_track_id = $1 ORDER BY captured_at DESC LIMIT $2`,
      [args.externalTrackId, limit],
    );
  } else {
    return [];
  }
  return result.rows.map((r) => ({
    id: r.id,
    source: r.source,
    payload: r.payload,
    capturedAt: r.captured_at,
  }));
}

export async function unlockTakeDecision(args: {
  takeId: string;
  userId: string;
}): Promise<TakeRow | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const { rows } = await p.query<TakeRowDb>(
    `UPDATE takes SET decision_locked_at = NULL
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [args.takeId, args.userId],
  );
  return rows[0] ? mapTakeRow(rows[0]) : null;
}

export async function updateProducerMemo(args: {
  takeId: string;
  userId: string;
  memoUrl: string | null;
  durationSec: number | null;
}): Promise<TakeRow | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const { rows } = await p.query<TakeRowDb>(
    `UPDATE takes
     SET producer_memo_url = $3, producer_memo_duration_sec = $4
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [args.takeId, args.userId, args.memoUrl, args.durationSec],
  );
  return rows[0] ? mapTakeRow(rows[0]) : null;
}

function normalizeDecision(value: string | null): ProducerDecision {
  if (value === "keeper" || value === "redo") return value;
  return null;
}

export async function updateProducerFeedback(args: {
  takeId: string;
  userId: string;
  producerNote?: string | null;
  producerDecision?: ProducerDecision;
}): Promise<TakeRow | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const sets: string[] = [];
  const values: unknown[] = [args.takeId, args.userId];
  if (args.producerNote !== undefined) {
    values.push(args.producerNote);
    sets.push(`producer_note = $${values.length}`);
  }
  if (args.producerDecision !== undefined) {
    values.push(args.producerDecision);
    sets.push(`producer_decision = $${values.length}`);
  }
  if (sets.length === 0) return null;
  const { rows } = await p.query<TakeRowDb>(
    `UPDATE takes SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2 RETURNING *`,
    values,
  );
  return rows[0] ? mapTakeRow(rows[0]) : null;
}
