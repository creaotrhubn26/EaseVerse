/**
 * Shared persistence for /api/v1/collab/* serverless functions.
 * CreatorHub service calls use x-api-key; signed-in EaseVerse clients use the
 * shared CreatorHub OAuth bearer/cookie path in the route itself.
 */
import { timingSafeEqual } from "node:crypto";
import { Pool } from "pg";
import type { VercelRequest, VercelResponse } from "@vercel/node";

let pool: Pool | null = null;
function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return pool;
}

/* ── Service API key (EXTERNAL_API_KEY) ─────────────────────────────────── */
export function extractApiKey(req: VercelRequest): string | undefined {
  const x = req.headers["x-api-key"];
  if (typeof x === "string" && x.trim()) return x.trim();
  if (Array.isArray(x) && x[0]?.trim()) return x[0].trim();
  return undefined;
}

/** Header-only service authentication. Bearer is reserved for CreatorHub users. */
export function isExternalKeyAuthorized(req: VercelRequest): boolean {
  const expected = process.env.EXTERNAL_API_KEY?.trim();
  const provided = extractApiKey(req);
  if (!expected || !provided) return false;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

export function requireExternalKey(req: VercelRequest, res: VercelResponse): boolean {
  if (!process.env.EXTERNAL_API_KEY?.trim()) {
    res.status(503).json({ error: "External API authentication is not configured" });
    return false;
  }
  if (!isExternalKeyAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export function parseBody(req: VercelRequest): any {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body || {};
}

function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.filter((x) => typeof x === "string") : [];
    } catch { return []; }
  }
  return [];
}

/* ── Lyrics ──────────────────────────────────────────────────────────────── */
export type CollabLyricsRecord = {
  externalTrackId: string; projectId?: string; title: string; artist?: string;
  bpm?: number; lyrics: string; collaborators: string[]; source: string; revision?: number; updatedAt: string; receivedAt: string;
};

let lyricsReady: Promise<void> | null = null;
async function ensureLyricsTable(p: Pool): Promise<void> {
  if (!lyricsReady) lyricsReady = (async () => {
    await p.query(`CREATE TABLE IF NOT EXISTS collab_lyrics_drafts (
      external_track_id VARCHAR(160) PRIMARY KEY, project_id VARCHAR(160), title VARCHAR(240) NOT NULL,
      artist VARCHAR(160), bpm INTEGER, lyrics TEXT NOT NULL, collaborators JSONB NOT NULL DEFAULT '[]'::jsonb,
      source VARCHAR(120) NOT NULL DEFAULT 'external', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);
    await p.query(`ALTER TABLE collab_lyrics_drafts ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_collab_lyrics_drafts_project_id ON collab_lyrics_drafts(project_id);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_collab_lyrics_drafts_source ON collab_lyrics_drafts(source);`);
  })();
  return lyricsReady;
}
function mapLyrics(row: any): CollabLyricsRecord {
  const bpm = row.bpm == null ? undefined : (Number.isFinite(Number(row.bpm)) ? Math.round(Number(row.bpm)) : undefined);
  return {
    externalTrackId: String(row.external_track_id), projectId: row.project_id ? String(row.project_id) : undefined,
    title: String(row.title), artist: row.artist ? String(row.artist) : undefined, bpm, lyrics: String(row.lyrics),
    collaborators: arr(row.collaborators), source: row.source ? String(row.source) : "external",
    revision: Math.max(1, Number(row.revision || 1)),
    updatedAt: new Date(row.updated_at || new Date().toISOString()).toISOString(),
    receivedAt: new Date(row.received_at || new Date().toISOString()).toISOString(),
  };
}
export async function upsertLyrics(rec: CollabLyricsRecord): Promise<{ record: CollabLyricsRecord; storage: string; applied: boolean }> {
  const p = getPool();
  if (!p) return { record: rec, storage: "memory", applied: true };
  await ensureLyricsTable(p);
  const r = await p.query(
    `INSERT INTO collab_lyrics_drafts (external_track_id,project_id,title,artist,bpm,lyrics,collaborators,source,revision,updated_at,received_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,1,$9::timestamptz,$10::timestamptz)
     ON CONFLICT (external_track_id) DO UPDATE SET project_id=EXCLUDED.project_id,title=EXCLUDED.title,artist=EXCLUDED.artist,
       bpm=EXCLUDED.bpm,lyrics=EXCLUDED.lyrics,collaborators=EXCLUDED.collaborators,source=EXCLUDED.source,
       revision=collab_lyrics_drafts.revision+1,updated_at=EXCLUDED.updated_at,received_at=EXCLUDED.received_at
       WHERE collab_lyrics_drafts.updated_at <= EXCLUDED.updated_at RETURNING *`,
    [rec.externalTrackId, rec.projectId ?? null, rec.title, rec.artist ?? null, rec.bpm ?? null, rec.lyrics,
     JSON.stringify(rec.collaborators), rec.source, rec.updatedAt, rec.receivedAt]);
  if (r.rows[0]) return { record: mapLyrics(r.rows[0]), storage: "postgres", applied: true };
  const current = await p.query(`SELECT * FROM collab_lyrics_drafts WHERE external_track_id=$1 LIMIT 1`, [rec.externalTrackId]);
  return {
    record: current.rows[0] ? mapLyrics(current.rows[0]) : rec,
    storage: "postgres",
    applied: false,
  };
}
export async function getLyrics(externalTrackId: string): Promise<{ record: CollabLyricsRecord | null; storage: string }> {
  const p = getPool();
  if (!p) return { record: null, storage: "memory" };
  await ensureLyricsTable(p);
  const r = await p.query(`SELECT * FROM collab_lyrics_drafts WHERE external_track_id=$1 LIMIT 1`, [externalTrackId]);
  return { record: r.rows[0] ? mapLyrics(r.rows[0]) : null, storage: "postgres" };
}
export async function listLyrics(f: { projectId?: string; source?: string }): Promise<{ records: CollabLyricsRecord[]; storage: string }> {
  const p = getPool();
  if (!p) return { records: [], storage: "memory" };
  await ensureLyricsTable(p);
  const where: string[] = []; const params: unknown[] = [];
  if (f.projectId) { params.push(f.projectId); where.push(`project_id=$${params.length}`); }
  if (f.source) { params.push(f.source); where.push(`source=$${params.length}`); }
  const r = await p.query(`SELECT * FROM collab_lyrics_drafts ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY updated_at DESC LIMIT 200`, params);
  return { records: r.rows.map(mapLyrics), storage: "postgres" };
}

/* ── Takes (keeper vocal recordings) ───────────────────────────────────── */
export async function getKeeperTakes(externalTrackId: string): Promise<{ takes: any[]; storage: string }> {
  const p = getPool();
  if (!p) return { takes: [], storage: "memory" };
  try {
    const r = await p.query(
      `SELECT id, filename, storage_url, producer_decision, decision_locked_at, created_at
         FROM takes WHERE external_track_id = $1 AND producer_decision = 'keeper'
        ORDER BY decision_locked_at DESC NULLS LAST, created_at DESC LIMIT 50`, [externalTrackId]);
    const takes = r.rows.map((row) => ({
      id: String(row.id), filename: row.filename || "take.wav", url: row.storage_url,
      decision: "keeper", decisionLockedAt: row.decision_locked_at || null, createdAt: row.created_at || null,
    }));
    return { takes, storage: "postgres" };
  } catch (e) {
    console.error("getKeeperTakes failed:", e);
    return { takes: [], storage: "error" };
  }
}

/* ── Pro Tools sync, schema v1 ──────────────────────────────────────────── */
export type ProToolsSectionType =
  | "verse" | "pre-chorus" | "chorus" | "bridge"
  | "final-chorus" | "intro" | "outro" | "custom";

export type ProToolsMarker = {
  id: string;
  label: string;
  positionMs: number;
  endPositionMs?: number;
  timecode?: string;
  sectionType?: ProToolsSectionType;
  color?: string;
};

export type ProToolsIntegrationContext = {
  creatorhubProjectId?: string;
  audioReviewProjectId?: string;
  easeverseProjectId?: string;
  proToolsSessionId?: string;
  returnTo?: string;
};

export type ProToolsRecord = {
  schemaVersion: 1;
  ownerUserId: string;
  externalTrackId: string;
  projectId: string;
  source: string;
  eventId?: string;
  revision: number;
  bpm?: number;
  keySignature?: string;
  timeSignature?: string;
  integrationContext: ProToolsIntegrationContext;
  markers: ProToolsMarker[];
  takeScores: unknown[];
  pronunciationFeedback: unknown[];
  updatedAt: string;
  receivedAt: string;
};

const PT_DEFAULT = "__default__";
const PT_SERVICE_OWNER = "__service__";
const PT_SECTION_TYPES = new Set<ProToolsSectionType>([
  "verse", "pre-chorus", "chorus", "bridge", "final-chorus", "intro", "outro", "custom",
]);

function optionalString(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function normalizeProToolsMarkers(value: unknown): ProToolsMarker[] {
  if (!Array.isArray(value)) return [];
  const markers: ProToolsMarker[] = [];
  for (const [index, candidate] of value.slice(0, 1000).entries()) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const raw = candidate as Record<string, unknown>;
    const legacyStart = finiteNumber(raw.startSeconds);
    const positionMs = finiteNumber(raw.positionMs) ?? (legacyStart === undefined ? undefined : legacyStart * 1000);
    if (positionMs === undefined || positionMs < 0) continue;
    const label = optionalString(raw.label, 200) ?? optionalString(raw.name, 200) ?? `Marker ${index + 1}`;
    const legacyEnd = finiteNumber(raw.endSeconds);
    const rawEnd = finiteNumber(raw.endPositionMs) ?? (legacyEnd === undefined ? undefined : legacyEnd * 1000);
    const sectionType = optionalString(raw.sectionType, 32) as ProToolsSectionType | undefined;
    const timecode = optionalString(raw.timecode, 32);
    const color = optionalString(raw.color, 32);
    markers.push({
      id: optionalString(raw.id, 160) ?? `marker-${index + 1}`,
      label,
      positionMs: Math.round(positionMs),
      ...(rawEnd !== undefined && rawEnd >= positionMs ? { endPositionMs: Math.round(rawEnd) } : {}),
      ...(timecode ? { timecode } : {}),
      ...(sectionType && PT_SECTION_TYPES.has(sectionType) ? { sectionType } : {}),
      ...(color ? { color } : {}),
    });
  }
  return markers.sort((a, b) => a.positionMs - b.positionMs);
}

function jsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
  }
  return {};
}

let ptReady: Promise<void> | null = null;
async function ensurePtTable(p: Pool): Promise<void> {
  if (!ptReady) ptReady = (async () => {
    await p.query(`CREATE TABLE IF NOT EXISTS collab_protools_sync (
      owner_user_id VARCHAR(160) NOT NULL DEFAULT '__service__',
      external_track_id VARCHAR(160) NOT NULL, project_id VARCHAR(160) NOT NULL DEFAULT '__default__',
      schema_version INTEGER NOT NULL DEFAULT 1, event_id VARCHAR(240), revision BIGINT NOT NULL DEFAULT 0,
      source VARCHAR(120) NOT NULL DEFAULT 'protools-companion', bpm INTEGER, key_signature VARCHAR(32),
      time_signature VARCHAR(24), integration_context JSONB NOT NULL DEFAULT '{}'::jsonb,
      markers JSONB NOT NULL DEFAULT '[]'::jsonb, take_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
      pronunciation_feedback JSONB NOT NULL DEFAULT '[]'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (owner_user_id, external_track_id, project_id));`);
    await p.query(`
      ALTER TABLE collab_protools_sync ADD COLUMN IF NOT EXISTS owner_user_id VARCHAR(160) NOT NULL DEFAULT '__service__';
      ALTER TABLE collab_protools_sync ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE collab_protools_sync ADD COLUMN IF NOT EXISTS event_id VARCHAR(240);
      ALTER TABLE collab_protools_sync ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE collab_protools_sync ADD COLUMN IF NOT EXISTS key_signature VARCHAR(32);
      ALTER TABLE collab_protools_sync ADD COLUMN IF NOT EXISTS time_signature VARCHAR(24);
      ALTER TABLE collab_protools_sync ADD COLUMN IF NOT EXISTS integration_context JSONB NOT NULL DEFAULT '{}'::jsonb;
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
           WHERE conrelid = 'collab_protools_sync'::regclass
             AND conname = 'collab_protools_sync_pkey'
             AND array_length(conkey, 1) = 2
        ) THEN
          ALTER TABLE collab_protools_sync DROP CONSTRAINT collab_protools_sync_pkey;
          ALTER TABLE collab_protools_sync
            ADD CONSTRAINT collab_protools_sync_pkey
            PRIMARY KEY (owner_user_id, external_track_id, project_id);
        END IF;
      END $$;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_collab_protools_event_id
        ON collab_protools_sync(event_id) WHERE event_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_collab_protools_owner_updated
        ON collab_protools_sync(owner_user_id, updated_at DESC);
    `);
  })();
  return ptReady;
}

function mapPt(row: any): ProToolsRecord {
  const bpm = row.bpm == null ? undefined : (Number.isFinite(Number(row.bpm)) ? Math.round(Number(row.bpm)) : undefined);
  const rawContext = jsonObject(row.integration_context);
  const integrationContext: ProToolsIntegrationContext = {
    creatorhubProjectId: optionalString(rawContext.creatorhubProjectId, 160),
    audioReviewProjectId: optionalString(rawContext.audioReviewProjectId, 160),
    easeverseProjectId: optionalString(rawContext.easeverseProjectId, 160),
    proToolsSessionId: optionalString(rawContext.proToolsSessionId, 160),
    returnTo: optionalString(rawContext.returnTo, 600),
  };
  return {
    schemaVersion: 1,
    ownerUserId: String(row.owner_user_id || PT_SERVICE_OWNER),
    externalTrackId: String(row.external_track_id),
    projectId: String(row.project_id || PT_DEFAULT),
    source: String(row.source || "protools-companion"),
    eventId: row.event_id ? String(row.event_id) : undefined,
    revision: Number.isSafeInteger(Number(row.revision)) ? Number(row.revision) : 0,
    bpm,
    keySignature: row.key_signature ? String(row.key_signature) : undefined,
    timeSignature: row.time_signature ? String(row.time_signature) : undefined,
    integrationContext,
    markers: normalizeProToolsMarkers(jsonArray(row.markers)),
    takeScores: jsonArray(row.take_scores),
    pronunciationFeedback: jsonArray(row.pronunciation_feedback),
    updatedAt: new Date(row.updated_at || new Date().toISOString()).toISOString(),
    receivedAt: new Date(row.received_at || new Date().toISOString()).toISOString(),
  };
}

export async function upsertProTools(rec: ProToolsRecord): Promise<{ record: ProToolsRecord; storage: string }> {
  const p = getPool();
  if (!p) return { record: rec, storage: "memory" };
  await ensurePtTable(p);
  const r = await p.query(
    `INSERT INTO collab_protools_sync
       (owner_user_id,external_track_id,project_id,schema_version,event_id,revision,source,bpm,key_signature,time_signature,
        integration_context,markers,take_scores,pronunciation_feedback,updated_at,received_at)
     VALUES ($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::timestamptz,$15::timestamptz)
     ON CONFLICT (owner_user_id,external_track_id,project_id) DO UPDATE SET
       event_id=COALESCE(EXCLUDED.event_id,collab_protools_sync.event_id),revision=EXCLUDED.revision,
       source=EXCLUDED.source,bpm=EXCLUDED.bpm,key_signature=EXCLUDED.key_signature,time_signature=EXCLUDED.time_signature,
       integration_context=EXCLUDED.integration_context,markers=EXCLUDED.markers,take_scores=EXCLUDED.take_scores,
       pronunciation_feedback=EXCLUDED.pronunciation_feedback,updated_at=EXCLUDED.updated_at,received_at=EXCLUDED.received_at
     WHERE EXCLUDED.revision > collab_protools_sync.revision
        OR (EXCLUDED.revision = collab_protools_sync.revision AND collab_protools_sync.updated_at <= EXCLUDED.updated_at)
     RETURNING *`,
    [rec.ownerUserId || PT_SERVICE_OWNER, rec.externalTrackId, rec.projectId || PT_DEFAULT, rec.eventId ?? null,
     rec.revision || 0, rec.source, rec.bpm ?? null, rec.keySignature ?? null, rec.timeSignature ?? null,
     JSON.stringify(rec.integrationContext || {}), JSON.stringify(normalizeProToolsMarkers(rec.markers)),
     JSON.stringify(rec.takeScores), JSON.stringify(rec.pronunciationFeedback), rec.updatedAt, rec.receivedAt]);
  if (r.rows[0]) return { record: mapPt(r.rows[0]), storage: "postgres" };
  const cur = await p.query(
    `SELECT * FROM collab_protools_sync WHERE owner_user_id=$1 AND external_track_id=$2 AND project_id=$3 LIMIT 1`,
    [rec.ownerUserId || PT_SERVICE_OWNER, rec.externalTrackId, rec.projectId || PT_DEFAULT],
  );
  return { record: cur.rows[0] ? mapPt(cur.rows[0]) : rec, storage: "postgres" };
}

export async function getProTools(externalTrackId: string, projectId?: string, ownerUserId?: string): Promise<{ record: ProToolsRecord | null; storage: string }> {
  const p = getPool();
  if (!p) return { record: null, storage: "memory" };
  await ensurePtTable(p);
  const where = ["external_track_id=$1"];
  const params: unknown[] = [externalTrackId];
  if (projectId) { params.push(projectId); where.push(`project_id=$${params.length}`); }
  if (ownerUserId) { params.push(ownerUserId); where.push(`owner_user_id=$${params.length}`); }
  const r = await p.query(
    `SELECT * FROM collab_protools_sync WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT 1`,
    params,
  );
  return { record: r.rows[0] ? mapPt(r.rows[0]) : null, storage: "postgres" };
}

export async function listProTools(f: { projectId?: string; source?: string; externalTrackId?: string; ownerUserId?: string }): Promise<{ records: ProToolsRecord[]; storage: string }> {
  const p = getPool();
  if (!p) return { records: [], storage: "memory" };
  await ensurePtTable(p);
  const where: string[] = []; const params: unknown[] = [];
  for (const [col, val] of [["project_id", f.projectId], ["source", f.source], ["external_track_id", f.externalTrackId], ["owner_user_id", f.ownerUserId]] as const) {
    if (val) { params.push(val); where.push(`${col}=$${params.length}`); }
  }
  const r = await p.query(`SELECT * FROM collab_protools_sync ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY updated_at DESC LIMIT 200`, params);
  return { records: r.rows.map(mapPt), storage: "postgres" };
}
