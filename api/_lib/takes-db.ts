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
};

export type TakeAnalysisRow = {
  takeId: string;
  transcript: string | null;
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
}): Promise<TakeRow | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const { rows } = await p.query<TakeRowDb>(
    `INSERT INTO takes
      (id, user_id, external_track_id, source_path, filename, byte_size, storage_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      args.id,
      args.userId,
      args.externalTrackId ?? null,
      args.sourcePath ?? null,
      args.filename,
      args.byteSize ?? null,
      args.storageUrl,
    ],
  );
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
      (take_id, transcript, pitch_mean_hz, pitch_stddev_cents, vibrato_rate_hz,
       energy_avg_db, energy_stddev_db, timing_score, pronunciation_score,
       ai_notes, best_take_in_group, processed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
     ON CONFLICT (take_id) DO UPDATE SET
       transcript = COALESCE(EXCLUDED.transcript, take_analyses.transcript),
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
  };
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
