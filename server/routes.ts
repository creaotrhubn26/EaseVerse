import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { Pool } from "pg";
import { z } from "zod";
import { buildSessionScoring } from "@shared/session-scoring";
import { registerAudioRoutes } from "./replit_integrations/audio";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerImageRoutes } from "./replit_integrations/image";
import { elevenLabsTextToSpeech } from "./elevenlabs";
import {
  EasePocketWorkerTaskError,
  scoreConsonantPrecisionInWorker,
} from "./easepocket/worker";
import {
  textToSpeech,
  openai,
  speechToText,
  ensureWavFormat,
  ensureCompatibleFormat,
  hasOpenAiCredentials,
} from "./replit_integrations/audio/client";
import {
  createLearningStore,
  normalizeLearningEasePocketInput,
  normalizeLearningSessionInput,
  resolveLearningUserId,
} from "./learning/store";
import {
  createCollabLyricsRealtimeHub,
  type CollabLyricsRealtimeHub,
} from "./collab-ws";
import {
  transcribeWithWhisper,
  isWhisperAvailable,
  getWhisperStatus,
  preloadWhisper,
} from "./whisper-stt";
import { getPronunciationCoaching, isGeminiAvailable } from "./gemini-coach";

const supportedVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
const voiceSchema = z.enum(supportedVoices);

const ttsRequestSchema = z.object({
  text: z.string().trim().min(1).max(500),
  voice: voiceSchema.optional(),
});

const elevenLabsVoiceSchema = z.enum(["female", "male"]);

const elevenLabsTtsRequestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  voice: elevenLabsVoiceSchema.optional(),
  genre: z.string().trim().max(48).optional(),
});

const pronounceRequestSchema = z.object({
  word: z.string().trim().min(1).max(60),
  context: z.string().trim().max(280).optional(),
  genre: z.string().trim().max(48).optional(),
  language: z.string().trim().max(40).optional(),
  accentGoal: z.string().trim().max(32).optional(),
});

const pronounceResultSchema = z.object({
  phonetic: z.string().trim().min(1).max(120),
  tip: z.string().trim().min(1).max(160),
  slow: z.string().trim().min(1).max(120),
});

const sessionScoreRequestSchema = z.object({
  lyrics: z.string().trim().min(1).max(10000),
  durationSeconds: z.number().int().min(1).max(3600).optional(),
  audioBase64: z.string().min(50),
  language: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{2}(-[a-z]{2})?$/)
    .optional(),
  accentGoal: z.string().trim().min(1).max(32).optional(),
});

const easePocketConsonantRequestSchema = z.object({
  audioBase64: z.string().min(50).max(15_000_000),
  bpm: z.number().int().min(40).max(300),
  grid: z.enum(["beat", "8th", "16th"]).optional(),
  toleranceMs: z.number().int().min(5).max(60).optional(),
  maxEvents: z.number().int().min(20).max(300).optional(),
});

const bpmSchema = z.preprocess((value) => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  return value;
}, z.number().int().min(30).max(300).optional());

const collabLyricsUpsertSchema = z.object({
  externalTrackId: z.string().trim().min(1).max(160),
  projectId: z.string().trim().max(160).optional(),
  title: z.string().trim().min(1).max(240),
  artist: z.string().trim().max(160).optional(),
  bpm: bpmSchema,
  lyrics: z.string().trim().min(1).max(20000),
  collaborators: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
  source: z.string().trim().max(120).optional(),
  updatedAt: z.string().datetime().optional(),
});

const dawMarkerSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(160),
  positionMs: z.number().int().min(0).max(14_400_000),
  sectionType: z
    .enum([
      "verse",
      "pre-chorus",
      "chorus",
      "bridge",
      "final-chorus",
      "intro",
      "outro",
      "custom",
    ])
    .optional(),
  color: z.string().trim().max(24).optional(),
});

const dawTakeScoreSchema = z.object({
  id: z.string().trim().min(1).max(120),
  takeName: z.string().trim().max(160).optional(),
  durationMs: z.number().int().min(0).max(14_400_000).optional(),
  textAccuracy: z.number().min(0).max(100).optional(),
  pronunciationClarity: z.number().min(0).max(100).optional(),
  timingConsistency: z.enum(["low", "medium", "high"]).optional(),
  overallScore: z.number().min(0).max(100).optional(),
  recordedAt: z.string().datetime().optional(),
  notes: z.string().trim().max(500).optional(),
});

const dawPronunciationFeedbackSchema = z.object({
  id: z.string().trim().min(1).max(120),
  word: z.string().trim().min(1).max(80),
  phonetic: z.string().trim().max(120).optional(),
  tip: z.string().trim().max(220).optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
  positionMs: z.number().int().min(0).max(14_400_000).optional(),
  takeId: z.string().trim().max(120).optional(),
  createdAt: z.string().datetime().optional(),
});

const collabProToolsSyncUpsertSchema = z.object({
  externalTrackId: z.string().trim().min(1).max(160),
  projectId: z.string().trim().max(160).optional(),
  source: z.string().trim().max(120).optional(),
  bpm: bpmSchema,
  markers: z.array(dawMarkerSchema).max(500).optional(),
  takeScores: z.array(dawTakeScoreSchema).max(300).optional(),
  pronunciationFeedback: z.array(dawPronunciationFeedbackSchema).max(800).optional(),
  updatedAt: z.string().datetime().optional(),
});

const learningSessionIngestSchema = z.object({
  userId: z.string().trim().min(1).max(120).optional(),
  sessionId: z.string().trim().min(1).max(120),
  songId: z.string().trim().max(120).optional(),
  genre: z.string().trim().max(48).optional(),
  title: z.string().trim().max(240).optional(),
  createdAt: z.string().datetime().optional(),
  durationSeconds: z.number().int().min(1).max(3600),
  lyrics: z.string().trim().min(1).max(20000),
  transcript: z.string().max(50000).optional(),
  insights: z.object({
    textAccuracy: z.number().min(0).max(100),
    pronunciationClarity: z.number().min(0).max(100),
    timingConsistency: z.enum(["low", "medium", "high"]),
    topToFix: z
      .array(
        z.object({
          word: z.string().trim().min(1).max(80),
          reason: z.string().trim().min(1).max(220),
        })
      )
      .max(12),
  }),
});

const learningEasePocketIngestSchema = z.object({
  userId: z.string().trim().min(1).max(120).optional(),
  eventId: z.string().trim().min(1).max(120),
  mode: z.enum(["subdivision", "silent", "consonant", "pocket", "slow"]),
  bpm: z.number().int().min(40).max(300),
  grid: z.enum(["beat", "8th", "16th"]),
  beatsPerBar: z.union([z.literal(2), z.literal(4)]),
  createdAt: z.string().datetime().optional(),
  stats: z.object({
    eventCount: z.number().int().min(0).max(5000),
    onTimePct: z.number().min(0).max(100),
    meanAbsMs: z.number().min(0).max(2000),
    stdDevMs: z.number().min(0).max(2000),
    avgOffsetMs: z.number().min(-2000).max(2000),
  }),
});

type CollabLyricsRecord = {
  externalTrackId: string;
  projectId?: string;
  title: string;
  artist?: string;
  bpm?: number;
  lyrics: string;
  collaborators: string[];
  source: string;
  updatedAt: string;
  receivedAt: string;
};

type DawMarker = z.infer<typeof dawMarkerSchema>;
type DawTakeScore = z.infer<typeof dawTakeScoreSchema>;
type DawPronunciationFeedback = z.infer<typeof dawPronunciationFeedbackSchema>;

type CollabProToolsSyncRecord = {
  externalTrackId: string;
  projectId?: string;
  source: string;
  bpm?: number;
  markers: DawMarker[];
  takeScores: DawTakeScore[];
  pronunciationFeedback: DawPronunciationFeedback[];
  updatedAt: string;
  receivedAt: string;
};

const collabLyricsStore = new Map<string, CollabLyricsRecord>();
const collabProToolsSyncStore = new Map<string, CollabProToolsSyncRecord>();
const collabLyricsDbUrl = process.env.DATABASE_URL?.trim();
const collabLyricsPool = collabLyricsDbUrl
  ? new Pool({
      connectionString: collabLyricsDbUrl,
      max: 5,
      idleTimeoutMillis: 30_000,
    })
  : null;
let collabLyricsTableReadyPromise: Promise<void> | null = null;
let collabProToolsTableReadyPromise: Promise<void> | null = null;
const learningStore = createLearningStore(collabLyricsPool);

type ElevenLabsVoiceSettings = {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
};

function normalizeGenreKey(value?: string): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function resolveGenreVoiceSettings(genre?: string): ElevenLabsVoiceSettings {
  switch (normalizeGenreKey(genre)) {
    case "jazz":
    case "classical":
    case "soul":
      return {
        stability: 0.7,
        similarity_boost: 0.75,
        style: 0.15,
        use_speaker_boost: true,
      };
    case "rock":
    case "hiphop":
      return {
        stability: 0.42,
        similarity_boost: 0.82,
        style: 0.65,
        use_speaker_boost: true,
      };
    case "rnb":
      return {
        stability: 0.5,
        similarity_boost: 0.8,
        style: 0.45,
        use_speaker_boost: true,
      };
    case "country":
      return {
        stability: 0.58,
        similarity_boost: 0.78,
        style: 0.34,
        use_speaker_boost: true,
      };
    case "pop":
    default:
      return {
        stability: 0.55,
        similarity_boost: 0.75,
        style: 0.25,
        use_speaker_boost: true,
      };
  }
}

function resolveVoiceByAccentAndGenre(accentGoal?: string, genre?: string): "male" | "female" {
  const accent = accentGoal?.toLowerCase() ?? "";
  if (accent.includes("female")) return "female";
  if (accent.includes("male")) return "male";

  const genreKey = normalizeGenreKey(genre);
  if (genreKey === "rock" || genreKey === "hiphop") return "male";
  if (genreKey === "rnb" || genreKey === "soul" || genreKey === "pop") return "female";
  return "female";
}

function collabRecordTimeMs(record: CollabLyricsRecord): number {
  const updatedAtMs = Date.parse(record.updatedAt);
  if (Number.isFinite(updatedAtMs)) {
    return updatedAtMs;
  }
  const receivedAtMs = Date.parse(record.receivedAt);
  return Number.isFinite(receivedAtMs) ? receivedAtMs : 0;
}

function sortCollabLyricsRecords(records: CollabLyricsRecord[]): CollabLyricsRecord[] {
  return [...records].sort((a, b) => collabRecordTimeMs(b) - collabRecordTimeMs(a));
}

function buildProToolsSyncKey(externalTrackId: string, projectId?: string): string {
  const normalizedProjectId = projectId?.trim() || "__default__";
  return `${normalizedProjectId}::${externalTrackId}`;
}

function normalizeProjectIdForStorage(projectId?: string): string {
  const normalized = projectId?.trim();
  return normalized && normalized.length > 0 ? normalized : "__default__";
}

function denormalizeProjectIdFromStorage(projectIdKey?: string | null): string | undefined {
  if (!projectIdKey || projectIdKey === "__default__") {
    return undefined;
  }
  return projectIdKey;
}

function proToolsSyncRecordTimeMs(record: CollabProToolsSyncRecord): number {
  const updatedAtMs = Date.parse(record.updatedAt);
  if (Number.isFinite(updatedAtMs)) {
    return updatedAtMs;
  }
  const receivedAtMs = Date.parse(record.receivedAt);
  return Number.isFinite(receivedAtMs) ? receivedAtMs : 0;
}

function sortProToolsSyncRecords(
  records: CollabProToolsSyncRecord[]
): CollabProToolsSyncRecord[] {
  return [...records].sort((a, b) => proToolsSyncRecordTimeMs(b) - proToolsSyncRecordTimeMs(a));
}

function parseJsonArrayLike<T>(input: unknown): T[] {
  if (Array.isArray(input)) {
    return input as T[];
  }
  if (typeof input === "string" && input.trim().length > 0) {
    try {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapProToolsSyncDbRow(row: any): CollabProToolsSyncRecord {
  const rawBpm = row.bpm;
  const bpm =
    rawBpm === null || rawBpm === undefined
      ? undefined
      : (() => {
          const parsed = typeof rawBpm === "number" ? rawBpm : Number(rawBpm);
          return Number.isFinite(parsed) ? Math.round(parsed) : undefined;
        })();

  return {
    externalTrackId: String(row.external_track_id),
    projectId: denormalizeProjectIdFromStorage(row.project_id),
    source: row.source ? String(row.source) : "protools-companion",
    bpm,
    markers: parseJsonArrayLike<DawMarker>(row.markers),
    takeScores: parseJsonArrayLike<DawTakeScore>(row.take_scores),
    pronunciationFeedback: parseJsonArrayLike<DawPronunciationFeedback>(row.pronunciation_feedback),
    updatedAt: new Date(row.updated_at || new Date().toISOString()).toISOString(),
    receivedAt: new Date(row.received_at || new Date().toISOString()).toISOString(),
  };
}

async function ensureCollabProToolsTable(): Promise<void> {
  if (!collabLyricsPool) {
    return;
  }
  if (!collabProToolsTableReadyPromise) {
    collabProToolsTableReadyPromise = (async () => {
      const tableExistsResult = await collabLyricsPool.query(
        `
          SELECT to_regclass('public.collab_protools_sync') AS table_name
        `
      );

      const tableName = tableExistsResult.rows[0]?.table_name;
      if (!tableName) {
        throw new Error(
          "Missing required table public.collab_protools_sync. Run migrations/0001_collab_protools_sync.sql (or npm run db:push)."
        );
      }

      const requiredColumns = [
        "external_track_id",
        "project_id",
        "source",
        "bpm",
        "markers",
        "take_scores",
        "pronunciation_feedback",
        "updated_at",
        "received_at",
        "created_at",
      ];

      const columnsResult = await collabLyricsPool.query(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'collab_protools_sync'
        `
      );

      const presentColumns = new Set(
        columnsResult.rows
          .map((row: { column_name?: unknown }) =>
            typeof row.column_name === "string" ? row.column_name : undefined
          )
          .filter((value): value is string => Boolean(value))
      );

      const missingColumns = requiredColumns.filter((column) => !presentColumns.has(column));
      if (missingColumns.length > 0) {
        throw new Error(
          `collab_protools_sync is missing columns: ${missingColumns.join(", ")}. Apply latest migration before starting API.`
        );
      }
    })();
  }

  return collabProToolsTableReadyPromise;
}

async function upsertProToolsSyncRecord(record: CollabProToolsSyncRecord): Promise<{
  item: CollabProToolsSyncRecord;
  stale: boolean;
}> {
  const key = buildProToolsSyncKey(record.externalTrackId, record.projectId);
  const existingInMemory = collabProToolsSyncStore.get(key);

  if (existingInMemory) {
    const incomingMs = proToolsSyncRecordTimeMs(record);
    const existingMs = proToolsSyncRecordTimeMs(existingInMemory);
    if (incomingMs < existingMs) {
      return { item: existingInMemory, stale: true };
    }
  }

  collabProToolsSyncStore.set(key, record);

  if (!collabLyricsPool) {
    return { item: record, stale: false };
  }

  try {
    await ensureCollabProToolsTable();
    const projectIdKey = normalizeProjectIdForStorage(record.projectId);
    const dbResult = await collabLyricsPool.query(
      `
        INSERT INTO collab_protools_sync (
          external_track_id,
          project_id,
          source,
          bpm,
          markers,
          take_scores,
          pronunciation_feedback,
          updated_at,
          received_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::timestamptz, $9::timestamptz)
        ON CONFLICT (external_track_id, project_id)
        DO UPDATE SET
          source = EXCLUDED.source,
          bpm = EXCLUDED.bpm,
          markers = EXCLUDED.markers,
          take_scores = EXCLUDED.take_scores,
          pronunciation_feedback = EXCLUDED.pronunciation_feedback,
          updated_at = EXCLUDED.updated_at,
          received_at = EXCLUDED.received_at
        WHERE collab_protools_sync.updated_at <= EXCLUDED.updated_at
        RETURNING *
      `,
      [
        record.externalTrackId,
        projectIdKey,
        record.source,
        record.bpm ?? null,
        JSON.stringify(record.markers),
        JSON.stringify(record.takeScores),
        JSON.stringify(record.pronunciationFeedback),
        record.updatedAt,
        record.receivedAt,
      ]
    );

    if (dbResult.rows.length > 0) {
      const persisted = mapProToolsSyncDbRow(dbResult.rows[0]);
      collabProToolsSyncStore.set(key, persisted);
      return { item: persisted, stale: false };
    }

    const latestResult = await collabLyricsPool.query(
      `
        SELECT *
        FROM collab_protools_sync
        WHERE external_track_id = $1 AND project_id = $2
        LIMIT 1
      `,
      [record.externalTrackId, projectIdKey]
    );

    if (latestResult.rows.length > 0) {
      const latest = mapProToolsSyncDbRow(latestResult.rows[0]);
      collabProToolsSyncStore.set(key, latest);
      return { item: latest, stale: true };
    }

    return { item: record, stale: false };
  } catch (error) {
    console.error("Pro Tools sync DB upsert failed. Falling back to in-memory store.", error);
    return { item: record, stale: false };
  }
}

async function getProToolsSyncRecord(
  externalTrackId: string,
  projectId?: string
): Promise<CollabProToolsSyncRecord | undefined> {
  if (collabLyricsPool) {
    try {
      await ensureCollabProToolsTable();

      if (projectId?.trim()) {
        const dbResult = await collabLyricsPool.query(
          `
            SELECT *
            FROM collab_protools_sync
            WHERE external_track_id = $1 AND project_id = $2
            LIMIT 1
          `,
          [externalTrackId, normalizeProjectIdForStorage(projectId)]
        );
        if (dbResult.rows.length > 0) {
          const row = mapProToolsSyncDbRow(dbResult.rows[0]);
          collabProToolsSyncStore.set(buildProToolsSyncKey(row.externalTrackId, row.projectId), row);
          return row;
        }
      } else {
        const dbResult = await collabLyricsPool.query(
          `
            SELECT *
            FROM collab_protools_sync
            WHERE external_track_id = $1
            ORDER BY updated_at DESC
            LIMIT 1
          `,
          [externalTrackId]
        );
        if (dbResult.rows.length > 0) {
          const row = mapProToolsSyncDbRow(dbResult.rows[0]);
          collabProToolsSyncStore.set(buildProToolsSyncKey(row.externalTrackId, row.projectId), row);
          return row;
        }
      }
    } catch (error) {
      console.error("Pro Tools sync DB fetch failed. Falling back to in-memory store.", error);
    }
  }

  if (projectId?.trim()) {
    return collabProToolsSyncStore.get(buildProToolsSyncKey(externalTrackId, projectId));
  }

  let latest: CollabProToolsSyncRecord | undefined;
  for (const record of collabProToolsSyncStore.values()) {
    if (record.externalTrackId !== externalTrackId) {
      continue;
    }
    if (!latest || proToolsSyncRecordTimeMs(record) >= proToolsSyncRecordTimeMs(latest)) {
      latest = record;
    }
  }
  return latest;
}

async function listProToolsSyncRecords(filters: {
  projectId?: string;
  source?: string;
  externalTrackId?: string;
}): Promise<CollabProToolsSyncRecord[]> {
  const projectId = filters.projectId?.trim();
  const source = filters.source?.trim();
  const externalTrackId = filters.externalTrackId?.trim();

  if (collabLyricsPool) {
    try {
      await ensureCollabProToolsTable();

      const whereClauses: string[] = [];
      const params: any[] = [];

      if (projectId) {
        params.push(normalizeProjectIdForStorage(projectId));
        whereClauses.push(`project_id = $${params.length}`);
      }
      if (source) {
        params.push(source);
        whereClauses.push(`source = $${params.length}`);
      }
      if (externalTrackId) {
        params.push(externalTrackId);
        whereClauses.push(`external_track_id = $${params.length}`);
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
      const dbResult = await collabLyricsPool.query(
        `
          SELECT *
          FROM collab_protools_sync
          ${whereSql}
          ORDER BY updated_at DESC
        `,
        params
      );

      const items = dbResult.rows.map(mapProToolsSyncDbRow);
      for (const item of items) {
        collabProToolsSyncStore.set(buildProToolsSyncKey(item.externalTrackId, item.projectId), item);
      }
      return items;
    } catch (error) {
      console.error("Pro Tools sync DB list failed. Falling back to in-memory store.", error);
    }
  }

  const filtered = Array.from(collabProToolsSyncStore.values()).filter((item) => {
    if (projectId && item.projectId !== projectId) {
      return false;
    }
    if (source && item.source !== source) {
      return false;
    }
    if (externalTrackId && item.externalTrackId !== externalTrackId) {
      return false;
    }
    return true;
  });

  return sortProToolsSyncRecords(filtered);
}

type RateWindowState = { count: number; windowStart: number };
const pronounceRateWindow = new Map<string, RateWindowState>();
const scoringRateWindow = new Map<string, RateWindowState>();
const easePocketRateWindow = new Map<string, RateWindowState>();
const learningRateWindow = new Map<string, RateWindowState>();
const rateLimiterCleanupState = new WeakMap<Map<string, RateWindowState>, number>();
const RATE_LIMITER_CLEANUP_INTERVAL_MS = 5 * 60_000;

function parseStringArrayLike(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  if (typeof input === "string" && input.trim().length > 0) {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean);
      }
    } catch {
      // Ignore parse errors and fall through to empty.
    }
  }
  return [];
}

function mapCollabLyricsDbRow(row: any): CollabLyricsRecord {
  const rawBpm = row.bpm;
  const bpm =
    rawBpm === null || rawBpm === undefined
      ? undefined
      : (() => {
          const parsed = typeof rawBpm === "number" ? rawBpm : Number(rawBpm);
          return Number.isFinite(parsed) ? Math.round(parsed) : undefined;
        })();
  return {
    externalTrackId: String(row.external_track_id),
    projectId: row.project_id ? String(row.project_id) : undefined,
    title: String(row.title),
    artist: row.artist ? String(row.artist) : undefined,
    bpm,
    lyrics: String(row.lyrics),
    collaborators: parseStringArrayLike(row.collaborators),
    source: row.source ? String(row.source) : "external",
    updatedAt: new Date(row.updated_at || new Date().toISOString()).toISOString(),
    receivedAt: new Date(row.received_at || new Date().toISOString()).toISOString(),
  };
}

async function ensureCollabLyricsTable(): Promise<void> {
  if (!collabLyricsPool) {
    return;
  }
  if (!collabLyricsTableReadyPromise) {
    collabLyricsTableReadyPromise = (async () => {
      await collabLyricsPool.query(`
        CREATE TABLE IF NOT EXISTS collab_lyrics_drafts (
          external_track_id VARCHAR(160) PRIMARY KEY,
          project_id VARCHAR(160),
          title VARCHAR(240) NOT NULL,
          artist VARCHAR(160),
          bpm INTEGER,
          lyrics TEXT NOT NULL,
          collaborators JSONB NOT NULL DEFAULT '[]'::jsonb,
          source VARCHAR(120) NOT NULL DEFAULT 'external',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await collabLyricsPool.query(`
        ALTER TABLE collab_lyrics_drafts
        ADD COLUMN IF NOT EXISTS bpm INTEGER;
      `);

      await collabLyricsPool.query(`
        CREATE INDEX IF NOT EXISTS idx_collab_lyrics_drafts_project_id
        ON collab_lyrics_drafts(project_id);
      `);

      await collabLyricsPool.query(`
        CREATE INDEX IF NOT EXISTS idx_collab_lyrics_drafts_source
        ON collab_lyrics_drafts(source);
      `);
    })();
  }

  return collabLyricsTableReadyPromise;
}

async function upsertCollabLyricsRecord(
  record: CollabLyricsRecord
): Promise<CollabLyricsRecord> {
  collabLyricsStore.set(record.externalTrackId, record);
  if (!collabLyricsPool) {
    return record;
  }

  try {
    await ensureCollabLyricsTable();
    const dbResult = await collabLyricsPool.query(
      `
        INSERT INTO collab_lyrics_drafts (
          external_track_id,
          project_id,
          title,
          artist,
          bpm,
          lyrics,
          collaborators,
          source,
          updated_at,
          received_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::timestamptz, $10::timestamptz)
        ON CONFLICT (external_track_id)
        DO UPDATE SET
          project_id = EXCLUDED.project_id,
          title = EXCLUDED.title,
          artist = EXCLUDED.artist,
          bpm = EXCLUDED.bpm,
          lyrics = EXCLUDED.lyrics,
          collaborators = EXCLUDED.collaborators,
          source = EXCLUDED.source,
          updated_at = EXCLUDED.updated_at,
          received_at = EXCLUDED.received_at
        RETURNING *
      `,
      [
        record.externalTrackId,
        record.projectId ?? null,
        record.title,
        record.artist ?? null,
        record.bpm ?? null,
        record.lyrics,
        JSON.stringify(record.collaborators),
        record.source,
        record.updatedAt,
        record.receivedAt,
      ]
    );

    const persisted = mapCollabLyricsDbRow(dbResult.rows[0]);
    collabLyricsStore.set(persisted.externalTrackId, persisted);
    return persisted;
  } catch (error) {
    console.error("Collab lyrics DB upsert failed. Falling back to in-memory store.", error);
    return record;
  }
}

async function getCollabLyricsRecord(
  externalTrackId: string
): Promise<CollabLyricsRecord | undefined> {
  if (!collabLyricsPool) {
    return collabLyricsStore.get(externalTrackId);
  }

  try {
    await ensureCollabLyricsTable();
    const dbResult = await collabLyricsPool.query(
      `
        SELECT *
        FROM collab_lyrics_drafts
        WHERE external_track_id = $1
        LIMIT 1
      `,
      [externalTrackId]
    );

    if (dbResult.rows.length === 0) {
      return collabLyricsStore.get(externalTrackId);
    }

    const row = mapCollabLyricsDbRow(dbResult.rows[0]);
    collabLyricsStore.set(row.externalTrackId, row);
    return row;
  } catch (error) {
    console.error("Collab lyrics DB fetch failed. Falling back to in-memory store.", error);
    return collabLyricsStore.get(externalTrackId);
  }
}

async function listCollabLyricsRecords(filters: {
  projectId?: string;
  source?: string;
}): Promise<CollabLyricsRecord[]> {
  const projectId = filters.projectId?.trim();
  const source = filters.source?.trim();

  if (!collabLyricsPool) {
    const filtered = Array.from(collabLyricsStore.values()).filter((item) => {
      if (projectId && item.projectId !== projectId) {
        return false;
      }
      if (source && item.source !== source) {
        return false;
      }
      return true;
    });
    return sortCollabLyricsRecords(filtered);
  }

  try {
    await ensureCollabLyricsTable();

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (projectId) {
      params.push(projectId);
      whereClauses.push(`project_id = $${params.length}`);
    }
    if (source) {
      params.push(source);
      whereClauses.push(`source = $${params.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const dbResult = await collabLyricsPool.query(
      `
        SELECT *
        FROM collab_lyrics_drafts
        ${whereSql}
        ORDER BY updated_at DESC
      `,
      params
    );

    const items = dbResult.rows.map(mapCollabLyricsDbRow);
    for (const item of items) {
      collabLyricsStore.set(item.externalTrackId, item);
    }
    return items;
  } catch (error) {
    console.error("Collab lyrics DB list failed. Falling back to in-memory store.", error);
    const filtered = Array.from(collabLyricsStore.values()).filter((item) => {
      if (projectId && item.projectId !== projectId) {
        return false;
      }
      if (source && item.source !== source) {
        return false;
      }
      return true;
    });
    return sortCollabLyricsRecords(filtered);
  }
}

function extractApiKey(req: Request): string | undefined {
  const apiKey = req.header("x-api-key");
  if (apiKey) {
    return apiKey;
  }

  const authHeader = req.header("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return undefined;
}

function getClientKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function getLearningUserId(
  req: Request,
  fallbackClientKey: string,
  bodyUserId?: string
): string {
  const headerUserId =
    req.header("x-easeverse-user-id") || req.header("x-user-id") || undefined;
  const queryUserId =
    typeof req.query.userId === "string" ? req.query.userId.trim() : undefined;

  return resolveLearningUserId({
    bodyUserId,
    headerUserId,
    queryUserId,
    fallbackKey: fallbackClientKey,
  });
}

function pruneRateWindow(
  bucket: Map<string, RateWindowState>,
  windowMs: number,
  now: number
) {
  const lastCleanup = rateLimiterCleanupState.get(bucket) ?? 0;
  if (now - lastCleanup < RATE_LIMITER_CLEANUP_INTERVAL_MS) {
    return;
  }

  for (const [key, state] of bucket.entries()) {
    if (now - state.windowStart > windowMs) {
      bucket.delete(key);
    }
  }
  rateLimiterCleanupState.set(bucket, now);
}

function isRateLimited(
  bucket: Map<string, RateWindowState>,
  key: string,
  maxPerWindow: number,
  windowMs: number
): boolean {
  const now = Date.now();
  pruneRateWindow(bucket, windowMs, now);
  const state = bucket.get(key);

  if (!state || now - state.windowStart > windowMs) {
    bucket.set(key, { count: 1, windowStart: now });
    return false;
  }

  if (state.count >= maxPerWindow) {
    return true;
  }

  state.count += 1;
  bucket.set(key, state);
  return false;
}

function enforceOptionalApiKey(
  req: Request,
  res: Response,
  envVarName: string,
  options?: { required?: boolean }
): boolean {
  const expectedKey = process.env[envVarName];
  if (!expectedKey) {
    if (options?.required) {
      res
        .status(503)
        .json({ error: `${envVarName} is required but not configured.` });
      return false;
    }
    return true;
  }

  const providedKey = extractApiKey(req);
  if (providedKey !== expectedKey) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

function getBaseUrl(req: Request): string {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "http";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host") || "localhost:5059";
  return `${protocol}://${host}`;
}

function getApiCatalog(req: Request) {
  const baseUrl = getBaseUrl(req);
  return {
    service: "EaseVerse API",
    version: "v1",
    baseUrl,
    docs: `${baseUrl}/api/v1/openapi.json`,
    auth: {
      header: "x-api-key or Authorization: Bearer <token>",
      note:
        "Set EXTERNAL_API_KEY on the server to require external API authentication. Set REQUIRE_API_KEYS=true to enforce keys in production.",
    },
    endpoints: [
      { method: "GET", path: "/api/v1", description: "API discovery document" },
      { method: "GET", path: "/api/v1/health", description: "Service health check" },
      { method: "POST", path: "/api/v1/tts", description: "Text to speech (mp3 response)" },
      {
        method: "POST",
        path: "/api/v1/tts/elevenlabs",
        description: "Text to speech via ElevenLabs (mp3 response)",
      },
      {
        method: "POST",
        path: "/api/v1/pronounce",
        description: "Pronunciation guidance + TTS audio in base64",
      },
      {
        method: "POST",
        path: "/api/v1/session-score",
        description: "STT-based lyric/session scoring",
      },
      {
        method: "POST",
        path: "/api/v1/easepocket/consonant-score",
        description: "EasePocket consonant precision timing score (ms-aligned)",
      },
      {
        method: "POST",
        path: "/api/v1/collab/lyrics",
        description: "Upsert collaborative lyric draft by external track id",
      },
      {
        method: "GET",
        path: "/api/v1/collab/lyrics/:externalTrackId",
        description: "Get latest collaborative lyric draft for a track",
      },
      {
        method: "POST",
        path: "/api/v1/collab/protools",
        description: "Upsert Pro Tools companion sync payload for a track",
      },
      {
        method: "GET",
        path: "/api/v1/collab/protools",
        description: "List Pro Tools companion sync payloads",
      },
      {
        method: "GET",
        path: "/api/v1/collab/protools/:externalTrackId",
        description: "Get latest Pro Tools companion sync payload for a track",
      },
      {
        method: "WS",
        path: "/api/v1/ws",
        description:
          "Realtime collaborative lyric updates (query filters: source, projectId, externalTrackId)",
      },
      {
        method: "POST",
        path: "/api/v1/learning/session",
        description: "Persist singing session outcomes for adaptive coaching",
      },
      {
        method: "POST",
        path: "/api/v1/learning/easepocket",
        description: "Persist EasePocket timing drill outcomes for adaptive coaching",
      },
      {
        method: "GET",
        path: "/api/v1/learning/profile",
        description: "Get a user learning profile snapshot",
      },
      {
        method: "GET",
        path: "/api/v1/learning/recommendations",
        description: "Get personalized practice recommendations",
      },
      {
        method: "GET",
        path: "/api/v1/learning/global-model",
        description: "Get aggregate global difficulty + tip effectiveness model",
      },
    ],
  };
}

function getOpenApiSpec(req: Request) {
  const baseUrl = getBaseUrl(req);
  return {
    openapi: "3.1.0",
    info: {
      title: "EaseVerse External API",
      version: "1.0.0",
      description: "Public integration endpoints for third-party systems.",
    },
    servers: [{ url: baseUrl }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
        },
        BearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
    },
    security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
    paths: {
      "/api/v1/health": {
        get: {
          summary: "Health check",
          responses: {
            "200": { description: "Healthy" },
          },
        },
      },
      "/api/v1/tts": {
        post: {
          summary: "Generate speech from text",
          responses: { "200": { description: "MP3 audio stream" } },
        },
      },
      "/api/v1/tts/elevenlabs": {
        post: {
          summary: "Generate speech from text (ElevenLabs)",
          responses: { "200": { description: "MP3 audio stream" } },
        },
      },
      "/api/v1/pronounce": {
        post: {
          summary: "Get pronunciation coaching for a word",
          responses: { "200": { description: "Pronunciation JSON payload" } },
        },
      },
      "/api/v1/session-score": {
        post: {
          summary: "Analyze recorded session against lyrics",
          responses: { "200": { description: "Session scoring result" } },
        },
      },
      "/api/v1/easepocket/consonant-score": {
        post: {
          summary: "Score consonant transients against a tempo grid (EasePocket)",
          responses: { "200": { description: "Consonant timing score" } },
        },
      },
      "/api/v1/collab/lyrics": {
        get: {
          summary: "List collaborative lyric drafts",
          responses: { "200": { description: "Lyric drafts" } },
        },
        post: {
          summary: "Upsert collaborative lyric draft",
          responses: { "200": { description: "Upsert result" } },
        },
      },
      "/api/v1/collab/lyrics/{externalTrackId}": {
        get: {
          summary: "Get collaborative lyric draft by external track id",
          responses: {
            "200": { description: "Lyric draft found" },
            "404": { description: "Lyric draft not found" },
          },
        },
      },
      "/api/v1/collab/protools": {
        get: {
          summary: "List Pro Tools companion sync payloads",
          responses: { "200": { description: "Pro Tools sync payloads" } },
        },
        post: {
          summary: "Upsert Pro Tools companion sync payload",
          responses: { "200": { description: "Upsert result" } },
        },
      },
      "/api/v1/collab/protools/{externalTrackId}": {
        get: {
          summary: "Get Pro Tools companion sync payload by external track id",
          responses: {
            "200": { description: "Sync payload found" },
            "404": { description: "Sync payload not found" },
          },
        },
      },
      "/api/v1/ws": {
        get: {
          summary: "WebSocket upgrade endpoint for collaborative lyric updates",
          description:
            "Upgrade this endpoint to a WebSocket connection for realtime lyric update events.",
          responses: {
            "101": { description: "Switching Protocols" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/v1/learning/session": {
        post: {
          summary: "Ingest a scored singing session for ML-driven coaching",
          responses: { "200": { description: "Learning ingest result" } },
        },
      },
      "/api/v1/learning/easepocket": {
        post: {
          summary: "Ingest an EasePocket drill result for timing learning",
          responses: { "200": { description: "Learning ingest result" } },
        },
      },
      "/api/v1/learning/profile": {
        get: {
          summary: "Get adaptive coaching profile for the requesting user",
          responses: {
            "200": { description: "Learning profile result" },
            "404": { description: "Profile not found" },
          },
        },
      },
      "/api/v1/learning/recommendations": {
        get: {
          summary: "Get personalized practice recommendations",
          responses: {
            "200": { description: "Recommendations result" },
            "404": { description: "Recommendations unavailable" },
          },
        },
      },
      "/api/v1/learning/global-model": {
        get: {
          summary: "Get global word difficulty and tip effectiveness model",
          responses: { "200": { description: "Global model result" } },
        },
      },
    },
  };
}

function ensureAiConfigured(res: Response): boolean {
  // Accept either OpenAI or Gemini/Whisper (free alternatives)
  if (hasOpenAiCredentials || isGeminiAvailable() || isWhisperAvailable()) {
    return true;
  }

  res.status(503).json({
    error:
      "AI service is not configured. Set GEMINI_API_KEY (free) or OPENAI_API_KEY.",
  });
  return false;
}

export async function registerRoutes(app: Express): Promise<Server> {
  registerChatRoutes(app, "/api/chat");
  registerAudioRoutes(app, "/api/audio");
  registerImageRoutes(app, "/api/image");
  let collabRealtimeHub: CollabLyricsRealtimeHub | null = null;
  const learningDbRequired = process.env.REQUIRE_LEARNING_DB === "true";
  const requireApiKeys = process.env.REQUIRE_API_KEYS === "true";

  if (process.env.WHISPER_PRELOAD !== "false") {
    void preloadWhisper();
  }

  if (collabLyricsPool) {
    await ensureCollabProToolsTable();
  }

  app.use("/api/v1", (req: Request, res: Response, next) => {
    if (!enforceOptionalApiKey(req, res, "EXTERNAL_API_KEY", { required: requireApiKeys })) {
      return;
    }
    next();
  });

  const ensureLearningStoreReady = (res: Response): boolean => {
    if (!learningDbRequired) {
      return true;
    }
    if (collabLyricsPool) {
      return true;
    }
    res.status(503).json({
      error: "Learning storage is unavailable. Configure DATABASE_URL to persist data.",
    });
    return false;
  };

  const handleTts = async (req: Request, res: Response) => {
    try {
      if (!ensureAiConfigured(res)) {
        return;
      }

      const parsedBody = ttsRequestSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({ error: "Invalid request body" });
      }

      const { text, voice } = parsedBody.data;
      const selectedVoice = voice || "nova";

      const audioBuffer = await textToSpeech(text, selectedVoice, "mp3");

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", audioBuffer.length.toString());
      res.send(audioBuffer);
    } catch (error) {
      console.error("TTS error:", error);
      res.status(500).json({ error: "Failed to generate speech" });
    }
  };

  const handleElevenLabsTts = async (req: Request, res: Response) => {
    try {
      const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
      if (!apiKey) {
        return res.status(503).json({
          error: "ElevenLabs is not configured. Set ELEVENLABS_API_KEY.",
        });
      }

      const parsedBody = elevenLabsTtsRequestSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({ error: "Invalid request body" });
      }

      const { text, voice, genre } = parsedBody.data;
      const resolvedVoice = voice ?? resolveVoiceByAccentAndGenre(undefined, genre);
      const modelId = process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2";
      const voiceSettings = resolveGenreVoiceSettings(genre);

      const result = await elevenLabsTextToSpeech({
        apiKey,
        text,
        voice: resolvedVoice,
        modelId,
        voiceSettings,
      });

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", result.audio.length.toString());
      res.setHeader("X-TTS-Cache", result.cache);
      res.send(result.audio);
    } catch (error) {
      console.error("ElevenLabs TTS error:", error);
      res.status(500).json({ error: "Failed to generate speech" });
    }
  };

  const handlePronounce = async (
    req: Request,
    res: Response,
    options?: { enforceServiceApiKey?: boolean }
  ) => {
    try {
      if (!ensureAiConfigured(res)) {
        return;
      }

      const enforceServiceApiKey = options?.enforceServiceApiKey ?? true;
      if (
        enforceServiceApiKey &&
        !enforceOptionalApiKey(req, res, "PRONOUNCE_API_KEY", { required: requireApiKeys })
      ) {
        return;
      }

      const clientKey = getClientKey(req);
      if (isRateLimited(pronounceRateWindow, clientKey, 30, 60_000)) {
        return res.status(429).json({ error: "Rate limit exceeded. Try again shortly." });
      }

      const parsedBody = pronounceRequestSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({ error: "Invalid request body" });
      }

      const { word, context, genre, language, accentGoal } = parsedBody.data;
      const contextLine = context || "";
      const languageHint = language?.trim() || "English";
      const accentHint = accentGoal?.trim();

      let resolved = { phonetic: word, tip: "Enunciate clearly", slow: word };

      // Try Gemini first (free tier alternative)
      if (isGeminiAvailable()) {
        try {
          resolved = await getPronunciationCoaching({
            word,
            context: contextLine,
            language: languageHint,
            accentGoal: accentHint,
          });
        } catch (geminiError) {
          console.warn('Gemini pronunciation failed, trying OpenAI fallback:', geminiError);
          
          // Fall back to OpenAI if Gemini fails
          if (hasOpenAiCredentials) {
            const completion = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              response_format: { type: "json_object" },
              messages: [
                {
                  role: "system",
                  content:
                    `You are a vocal pronunciation coach for singers. Return strict JSON with keys: phonetic, tip, slow. Tip must be in ${languageHint}.`,
                },
                {
                  role: "user",
                  content: contextLine
                    ? `Word: "${word}" in lyric line: "${contextLine}".${accentHint ? ` Accent goal: ${accentHint}.` : ""} Keep tip under 15 words.`
                    : `Word: "${word}".${accentHint ? ` Accent goal: ${accentHint}.` : ""} Keep tip under 15 words.`,
                },
              ],
              temperature: 0.2,
              max_tokens: 150,
            });

            const content = completion.choices[0]?.message?.content;
            if (content) {
              try {
                const rawJson = JSON.parse(content);
                const parsedResult = pronounceResultSchema.safeParse(rawJson);
                if (parsedResult.success) {
                  resolved = parsedResult.data;
                }
              } catch {
                // Keep fallback values
              }
            }
          }
        }
      } else if (hasOpenAiCredentials) {
        // Use OpenAI if Gemini not available
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                `You are a vocal pronunciation coach for singers. Return strict JSON with keys: phonetic, tip, slow. Tip must be in ${languageHint}.`,
            },
            {
              role: "user",
              content: contextLine
                ? `Word: "${word}" in lyric line: "${contextLine}".${accentHint ? ` Accent goal: ${accentHint}.` : ""} Keep tip under 15 words.`
                : `Word: "${word}".${accentHint ? ` Accent goal: ${accentHint}.` : ""} Keep tip under 15 words.`,
            },
          ],
          temperature: 0.2,
          max_tokens: 150,
        });

        const content = completion.choices[0]?.message?.content;
        if (content) {
          try {
            const rawJson = JSON.parse(content);
            const parsedResult = pronounceResultSchema.safeParse(rawJson);
            if (parsedResult.success) {
              resolved = parsedResult.data;
            }
          } catch {
            // Keep fallback values
          }
        }
      }

      // Prefer ElevenLabs for more natural pronunciation playback when configured.
      // Fall back to default TTS so pronunciation guidance still returns audio when possible.
      let audioBase64: string | undefined;
      try {
        const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY?.trim();
        const elevenLabsModelId = process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2";

        let audioBuffer: Buffer;
        const ttsText = word;
        if (elevenLabsApiKey) {
          const elevenLabsVoice = resolveVoiceByAccentAndGenre(accentHint, genre);
          const voiceSettings = resolveGenreVoiceSettings(genre);
          const result = await elevenLabsTextToSpeech({
            apiKey: elevenLabsApiKey,
            text: ttsText,
            voice: elevenLabsVoice,
            modelId: elevenLabsModelId,
            voiceSettings,
          });
          audioBuffer = result.audio;
        } else {
          audioBuffer = await textToSpeech(ttsText, "nova", "mp3");
        }
        audioBase64 = audioBuffer.toString("base64");
      } catch (ttsError) {
        console.warn("TTS audio generation failed, returning coaching only:", ttsError instanceof Error ? ttsError.message : String(ttsError));
      }

      res.json({
        word,
        phonetic: resolved.phonetic,
        tip: resolved.tip,
        slow: resolved.slow,
        ...(audioBase64 && { audioBase64 }),
      });
    } catch (error) {
      console.error("Pronounce error:", error);
      res.status(500).json({ error: "Failed to generate pronunciation" });
    }
  };

  const handleSessionScore = async (
    req: Request,
    res: Response,
    options?: { enforceServiceApiKey?: boolean }
  ) => {
    try {
      if (!ensureAiConfigured(res)) {
        return;
      }

      const enforceServiceApiKey = options?.enforceServiceApiKey ?? true;
      if (
        enforceServiceApiKey &&
        !enforceOptionalApiKey(req, res, "SESSION_SCORING_API_KEY", { required: requireApiKeys })
      ) {
        return;
      }

      const clientKey = getClientKey(req);
      if (isRateLimited(scoringRateWindow, clientKey, 12, 60_000)) {
        return res.status(429).json({ error: "Rate limit exceeded. Try again shortly." });
      }

      const parsedBody = sessionScoreRequestSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({ error: "Invalid request body" });
      }

      const { lyrics, audioBase64, durationSeconds, language } = parsedBody.data;
      const rawAudio = Buffer.from(audioBase64, "base64");
      const { buffer: compatibleAudio, format } = await ensureCompatibleFormat(rawAudio);
      const normalizedLanguage = language ? language.split("-")[0] : undefined;
      
      let transcript = "";

      // Try Whisper first (free, open source)
      if (isWhisperAvailable()) {
        try {
          transcript = await transcribeWithWhisper(
            compatibleAudio,
            {
              language: normalizedLanguage,
              task: 'transcribe',
            }
          );
        } catch (whisperError) {
          console.warn('Whisper transcription failed, trying OpenAI fallback:', whisperError);
          
          // Fall back to OpenAI if Whisper fails
          if (hasOpenAiCredentials) {
            transcript = await speechToText(
              compatibleAudio,
              format === "wav" || format === "mp3" ? format : "wav",
              normalizedLanguage ? { language: normalizedLanguage } : undefined
            );
          }
        }
      } else if (hasOpenAiCredentials) {
        // Use OpenAI if Whisper not available
        transcript = await speechToText(
          compatibleAudio,
          format === "wav" || format === "mp3" ? format : "wav",
          normalizedLanguage ? { language: normalizedLanguage } : undefined
        );
      }

      const score = buildSessionScoring({
        expectedLyrics: lyrics,
        transcript,
        durationSeconds,
      });

      return res.json(score);
    } catch (error) {
      console.error("Session scoring error:", error);
      return res.status(500).json({ error: "Failed to analyze session" });
    }
  };

  const handleEasePocketConsonantScore = async (req: Request, res: Response) => {
    try {
      const clientKey = getClientKey(req);
      if (isRateLimited(easePocketRateWindow, clientKey, 20, 60_000)) {
        return res.status(429).json({ error: "Rate limit exceeded. Try again shortly." });
      }

      const parsedBody = easePocketConsonantRequestSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({ error: "Invalid request body" });
      }

      const { audioBase64, bpm, grid, toleranceMs, maxEvents } = parsedBody.data;
      let wavBuffer: Buffer;
      try {
        const rawAudio = Buffer.from(audioBase64, "base64");
        wavBuffer = await ensureWavFormat(rawAudio);
      } catch {
        return res.status(400).json({
          error:
            "Invalid or unsupported audio input. Record a short take and retry.",
        });
      }

      const result = await scoreConsonantPrecisionInWorker({
        wavBuffer,
        bpm,
        grid: grid ?? "16th",
        toleranceMs,
        maxEvents,
      });

      return res.json({
        ok: true,
        durationSeconds: result.durationSeconds,
        ...result.score,
      });
    } catch (error) {
      if (error instanceof EasePocketWorkerTaskError) {
        const status =
          error.code === "invalid_audio" ||
          error.code === "too_short" ||
          error.code === "too_long"
            ? 400
            : 503;
        return res.status(status).json({ error: error.message });
      }
      console.error("EasePocket consonant score error:", error);
      return res.status(500).json({ error: "Failed to score consonant timing" });
    }
  };

  const handleCollabLyricsUpsert = async (req: Request, res: Response) => {
    try {
      const parsedBody = collabLyricsUpsertSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({ error: "Invalid request body" });
      }

      const data = parsedBody.data;
      const receivedAt = new Date().toISOString();
      const existing = await getCollabLyricsRecord(data.externalTrackId);
      const draftRecord: CollabLyricsRecord = {
        externalTrackId: data.externalTrackId,
        projectId: data.projectId,
        title: data.title,
        artist: data.artist,
        bpm: data.bpm ?? existing?.bpm,
        lyrics: data.lyrics,
        collaborators: data.collaborators ?? existing?.collaborators ?? [],
        source: data.source ?? existing?.source ?? "external",
        updatedAt: data.updatedAt ?? new Date().toISOString(),
        receivedAt,
      };

      const persistedRecord = await upsertCollabLyricsRecord(draftRecord);
      collabRealtimeHub?.publish({
        externalTrackId: persistedRecord.externalTrackId,
        title: persistedRecord.title,
        projectId: persistedRecord.projectId,
        source: persistedRecord.source,
        artist: persistedRecord.artist,
        bpm: persistedRecord.bpm,
        updatedAt: persistedRecord.updatedAt,
        collaborators: persistedRecord.collaborators,
      });
      return res.json({
        ok: true,
        storage: collabLyricsPool ? "postgres" : "memory",
        item: persistedRecord,
      });
    } catch (error) {
      console.error("Collab lyrics upsert error:", error);
      return res.status(500).json({ error: "Failed to upsert lyric draft" });
    }
  };

  const handleLearningSessionIngest = async (req: Request, res: Response) => {
    try {
      if (!ensureLearningStoreReady(res)) {
        return;
      }
      const clientKey = getClientKey(req);
      if (isRateLimited(learningRateWindow, clientKey, 80, 60_000)) {
        return res.status(429).json({ error: "Rate limit exceeded. Try again shortly." });
      }

      const parsedBody = learningSessionIngestSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({ error: "Invalid request body" });
      }

      const userId = getLearningUserId(req, clientKey, parsedBody.data.userId);
      const normalized = normalizeLearningSessionInput({
        userId,
        sessionId: parsedBody.data.sessionId,
        songId: parsedBody.data.songId,
        genre: parsedBody.data.genre,
        title: parsedBody.data.title,
        createdAt: parsedBody.data.createdAt ?? new Date().toISOString(),
        durationSeconds: parsedBody.data.durationSeconds,
        lyrics: parsedBody.data.lyrics,
        transcript: parsedBody.data.transcript,
        insights: parsedBody.data.insights,
      });

      const result = await learningStore.ingestSession(normalized);
      return res.json({ ok: true, ...result });
    } catch (error) {
      console.error("Learning session ingest error:", error);
      return res.status(500).json({ error: "Failed to ingest learning session" });
    }
  };

  const handleLearningEasePocketIngest = async (req: Request, res: Response) => {
    try {
      if (!ensureLearningStoreReady(res)) {
        return;
      }
      const clientKey = getClientKey(req);
      if (isRateLimited(learningRateWindow, clientKey, 80, 60_000)) {
        return res.status(429).json({ error: "Rate limit exceeded. Try again shortly." });
      }

      const parsedBody = learningEasePocketIngestSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({ error: "Invalid request body" });
      }

      const userId = getLearningUserId(req, clientKey, parsedBody.data.userId);
      const normalized = normalizeLearningEasePocketInput({
        userId,
        eventId: parsedBody.data.eventId,
        mode: parsedBody.data.mode,
        bpm: parsedBody.data.bpm,
        grid: parsedBody.data.grid,
        beatsPerBar: parsedBody.data.beatsPerBar,
        createdAt: parsedBody.data.createdAt ?? new Date().toISOString(),
        stats: parsedBody.data.stats,
      });

      const result = await learningStore.ingestEasePocket(normalized);
      return res.json({ ok: true, ...result });
    } catch (error) {
      console.error("Learning EasePocket ingest error:", error);
      return res.status(500).json({ error: "Failed to ingest EasePocket learning event" });
    }
  };

  const handleLearningProfileGet = async (req: Request, res: Response) => {
    try {
      if (!ensureLearningStoreReady(res)) {
        return;
      }
      const clientKey = getClientKey(req);
      const userId = getLearningUserId(req, clientKey);
      const profile = await learningStore.getUserProfile(userId);
      if (!profile) {
        return res.status(404).json({ error: "Learning profile not found" });
      }
      return res.json({ ok: true, userId, profile });
    } catch (error) {
      console.error("Learning profile error:", error);
      return res.status(500).json({ error: "Failed to fetch learning profile" });
    }
  };

  const handleLearningRecommendationsGet = async (req: Request, res: Response) => {
    try {
      if (!ensureLearningStoreReady(res)) {
        return;
      }
      const clientKey = getClientKey(req);
      const userId = getLearningUserId(req, clientKey);
      const recommendations = await learningStore.getRecommendations(userId);
      if (!recommendations) {
        return res.status(404).json({ error: "Recommendations unavailable for this user" });
      }
      return res.json({ ok: true, userId, recommendations });
    } catch (error) {
      console.error("Learning recommendations error:", error);
      return res.status(500).json({ error: "Failed to fetch recommendations" });
    }
  };

  const handleLearningGlobalModelGet = async (req: Request, res: Response) => {
    try {
      if (!ensureLearningStoreReady(res)) {
        return;
      }
      const parsedLimit = Number.parseInt(String(req.query.limit || "20"), 10);
      const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(100, parsedLimit)) : 20;
      const model = await learningStore.getGlobalModel(limit);
      return res.json({
        ok: true,
        words: model.words,
        tips: model.tips,
      });
    } catch (error) {
      console.error("Learning global model error:", error);
      return res.status(500).json({ error: "Failed to fetch global model" });
    }
  };

  const handleCollabProToolsSyncUpsert = async (req: Request, res: Response) => {
    try {
      const parsedBody = collabProToolsSyncUpsertSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({ error: "Invalid request body" });
      }

      const data = parsedBody.data;
      const receivedAt = new Date().toISOString();
      const existing = await getProToolsSyncRecord(data.externalTrackId, data.projectId);

      const syncRecord: CollabProToolsSyncRecord = {
        externalTrackId: data.externalTrackId,
        projectId: data.projectId,
        source: data.source ?? existing?.source ?? "protools-companion",
        bpm: data.bpm ?? existing?.bpm,
        markers: data.markers ?? existing?.markers ?? [],
        takeScores: data.takeScores ?? existing?.takeScores ?? [],
        pronunciationFeedback:
          data.pronunciationFeedback ?? existing?.pronunciationFeedback ?? [],
        updatedAt: data.updatedAt ?? new Date().toISOString(),
        receivedAt,
      };

      const persisted = await upsertProToolsSyncRecord(syncRecord);
      if (persisted.stale) {
        return res.status(409).json({
          error: "Stale Pro Tools sync payload rejected",
          code: "stale_write",
          item: persisted.item,
        });
      }

      return res.json({
        ok: true,
        storage: collabLyricsPool ? "postgres" : "memory",
        item: persisted.item,
      });
    } catch (error) {
      console.error("Pro Tools sync upsert error:", error);
      return res.status(500).json({ error: "Failed to upsert Pro Tools sync payload" });
    }
  };

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: "EaseVerse API",
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/v1", (req: Request, res: Response) => {
    res.json(getApiCatalog(req));
  });

  app.get("/api/v1/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      version: "v1",
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/v1/openapi.json", (req: Request, res: Response) => {
    res.json(getOpenApiSpec(req));
  });

  app.get("/api/v1/whisper/status", (_req: Request, res: Response) => {
    res.json({ ok: true, ...getWhisperStatus() });
  });

  app.get("/api/v1/collab/lyrics", async (req: Request, res: Response) => {
    try {
      const projectIdQuery =
        typeof req.query.projectId === "string" ? req.query.projectId.trim() : "";
      const sourceQuery =
        typeof req.query.source === "string" ? req.query.source.trim() : "";

      const items = await listCollabLyricsRecords({
        projectId: projectIdQuery || undefined,
        source: sourceQuery || undefined,
      });

      return res.json({
        ok: true,
        storage: collabLyricsPool ? "postgres" : "memory",
        appliedFilters: {
          projectId: projectIdQuery || null,
          source: sourceQuery || null,
        },
        count: items.length,
        items,
      });
    } catch (error) {
      console.error("Collab lyrics list error:", error);
      return res.status(500).json({ error: "Failed to list lyric drafts" });
    }
  });

  app.get("/api/v1/collab/lyrics/:externalTrackId", async (req: Request, res: Response) => {
    try {
      const externalTrackId = String(req.params.externalTrackId || "").trim();
      const item = await getCollabLyricsRecord(externalTrackId);
      if (!item) {
        return res.status(404).json({ error: "Lyric draft not found" });
      }

      return res.json({
        ok: true,
        storage: collabLyricsPool ? "postgres" : "memory",
        item,
      });
    } catch (error) {
      console.error("Collab lyrics get error:", error);
      return res.status(500).json({ error: "Failed to fetch lyric draft" });
    }
  });

  app.get("/api/v1/collab/protools", async (req: Request, res: Response) => {
    try {
      const projectIdQuery =
        typeof req.query.projectId === "string" ? req.query.projectId.trim() : "";
      const sourceQuery =
        typeof req.query.source === "string" ? req.query.source.trim() : "";
      const externalTrackIdQuery =
        typeof req.query.externalTrackId === "string"
          ? req.query.externalTrackId.trim()
          : "";

      const items = await listProToolsSyncRecords({
        projectId: projectIdQuery || undefined,
        source: sourceQuery || undefined,
        externalTrackId: externalTrackIdQuery || undefined,
      });

      return res.json({
        ok: true,
        storage: collabLyricsPool ? "postgres" : "memory",
        count: items.length,
        items,
      });
    } catch (error) {
      console.error("Pro Tools sync list error:", error);
      return res.status(500).json({ error: "Failed to list Pro Tools sync payloads" });
    }
  });

  app.get("/api/v1/collab/protools/:externalTrackId", async (req: Request, res: Response) => {
    try {
      const externalTrackId = String(req.params.externalTrackId || "").trim();
      const projectIdQuery =
        typeof req.query.projectId === "string" ? req.query.projectId.trim() : "";
      const item = await getProToolsSyncRecord(externalTrackId, projectIdQuery || undefined);

      if (!item) {
        return res.status(404).json({ error: "Pro Tools sync payload not found" });
      }

      return res.json({
        ok: true,
        storage: collabLyricsPool ? "postgres" : "memory",
        item,
      });
    } catch (error) {
      console.error("Pro Tools sync get error:", error);
      return res.status(500).json({ error: "Failed to fetch Pro Tools sync payload" });
    }
  });

  app.post("/api/v1/collab/lyrics", handleCollabLyricsUpsert);
  app.post("/api/v1/collab/protools", handleCollabProToolsSyncUpsert);
  app.post("/api/v1/learning/session", handleLearningSessionIngest);
  app.post("/api/v1/learning/easepocket", handleLearningEasePocketIngest);
  app.get("/api/v1/learning/profile", handleLearningProfileGet);
  app.get("/api/v1/learning/recommendations", handleLearningRecommendationsGet);
  app.get("/api/v1/learning/global-model", handleLearningGlobalModelGet);

  app.post("/api/tts", handleTts);
  app.post("/api/v1/tts", handleTts);
  app.post("/api/tts/elevenlabs", handleElevenLabsTts);
  app.post("/api/v1/tts/elevenlabs", handleElevenLabsTts);

  app.post("/api/pronounce", (req: Request, res: Response) =>
    handlePronounce(req, res, { enforceServiceApiKey: true })
  );
  app.post("/api/v1/pronounce", (req: Request, res: Response) =>
    handlePronounce(req, res, { enforceServiceApiKey: false })
  );

  app.post("/api/session-score", (req: Request, res: Response) =>
    handleSessionScore(req, res, { enforceServiceApiKey: true })
  );
  app.post("/api/v1/session-score", (req: Request, res: Response) =>
    handleSessionScore(req, res, { enforceServiceApiKey: false })
  );

  app.post("/api/v1/easepocket/consonant-score", handleEasePocketConsonantScore);

  const httpServer = createServer(app);
  const allowedRealtimeOrigins = new Set<string>();
  const allowAllOrigins = process.env.CORS_ALLOW_ALL === "true";
  const configuredOrigins = process.env.CORS_ALLOW_ORIGINS
    ? process.env.CORS_ALLOW_ORIGINS.split(",")
    : [];
  for (const origin of configuredOrigins) {
    const trimmed = origin.trim();
    if (trimmed) {
      allowedRealtimeOrigins.add(trimmed);
    }
  }

  const replitDevDomain = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (replitDevDomain) {
    allowedRealtimeOrigins.add(`https://${replitDevDomain}`);
  }
  const replitDomains = process.env.REPLIT_DOMAINS
    ? process.env.REPLIT_DOMAINS.split(",")
    : [];
  for (const domain of replitDomains) {
    const trimmed = domain.trim();
    if (trimmed) {
      allowedRealtimeOrigins.add(`https://${trimmed}`);
    }
  }

  collabRealtimeHub = createCollabLyricsRealtimeHub({
    server: httpServer,
    path: "/api/v1/ws",
    expectedApiKey: process.env.EXTERNAL_API_KEY?.trim(),
    allowAllOrigins,
    allowedOrigins: Array.from(allowedRealtimeOrigins),
  });
  httpServer.on("close", () => {
    collabRealtimeHub?.close();
    collabRealtimeHub = null;
  });

  return httpServer;
}
