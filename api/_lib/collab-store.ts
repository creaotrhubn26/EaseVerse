/**
 * collab-store.ts — delt lagring for /api/v1/collab/* serverless-funksjoner.
 * Portet 1:1 fra server/routes.ts (Express) til Vercel, med Postgres
 * (collab_lyrics_drafts + collab_protools_sync) + EXTERNAL_API_KEY-auth.
 */
import { Pool } from "pg";
import type { VercelRequest, VercelResponse } from "@vercel/node";

let pool: Pool | null = null;
function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return pool;
}

/* ── API-nøkkel (EXTERNAL_API_KEY) ───────────────────────────────────────── */
export function extractApiKey(req: VercelRequest): string | undefined {
  const x = req.headers["x-api-key"];
  if (typeof x === "string" && x.trim()) return x.trim();
  if (Array.isArray(x) && x[0]?.trim()) return x[0].trim();
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  const q = (req.query.apiKey || req.query.token) as string | undefined;
  return typeof q === "string" && q.trim() ? q.trim() : undefined;
}

/** Returnerer true hvis forespørselen er autorisert. Skriver 401 + returnerer false ellers. */
export function requireExternalKey(req: VercelRequest, res: VercelResponse): boolean {
  const expected = process.env.EXTERNAL_API_KEY;
  if (!expected) return true; // ikke konfigurert → åpen (samme som Express enforceOptionalApiKey)
  if (extractApiKey(req) !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export function parseBody(req: VercelRequest): any {
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
  return req.body || {};
}

function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p.filter((x) => typeof x === "string") : []; } catch { return []; } }
  return [];
}

/* ── Lyrics ──────────────────────────────────────────────────────────────── */
export type CollabLyricsRecord = {
  externalTrackId: string; projectId?: string; title: string; artist?: string;
  bpm?: number; lyrics: string; collaborators: string[]; source: string; updatedAt: string; receivedAt: string;
};

let lyricsReady: Promise<void> | null = null;
async function ensureLyricsTable(p: Pool): Promise<void> {
  if (!lyricsReady) lyricsReady = (async () => {
    await p.query(`CREATE TABLE IF NOT EXISTS collab_lyrics_drafts (
      external_track_id VARCHAR(160) PRIMARY KEY, project_id VARCHAR(160), title VARCHAR(240) NOT NULL,
      artist VARCHAR(160), bpm INTEGER, lyrics TEXT NOT NULL, collaborators JSONB NOT NULL DEFAULT '[]'::jsonb,
      source VARCHAR(120) NOT NULL DEFAULT 'external', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);
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
    updatedAt: new Date(row.updated_at || new Date().toISOString()).toISOString(),
    receivedAt: new Date(row.received_at || new Date().toISOString()).toISOString(),
  };
}
export async function upsertLyrics(rec: CollabLyricsRecord): Promise<{ record: CollabLyricsRecord; storage: string }> {
  const p = getPool();
  if (!p) return { record: rec, storage: "memory" };
  await ensureLyricsTable(p);
  const r = await p.query(
    `INSERT INTO collab_lyrics_drafts (external_track_id,project_id,title,artist,bpm,lyrics,collaborators,source,updated_at,received_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::timestamptz,$10::timestamptz)
     ON CONFLICT (external_track_id) DO UPDATE SET project_id=EXCLUDED.project_id,title=EXCLUDED.title,artist=EXCLUDED.artist,
       bpm=EXCLUDED.bpm,lyrics=EXCLUDED.lyrics,collaborators=EXCLUDED.collaborators,source=EXCLUDED.source,
       updated_at=EXCLUDED.updated_at,received_at=EXCLUDED.received_at RETURNING *`,
    [rec.externalTrackId, rec.projectId ?? null, rec.title, rec.artist ?? null, rec.bpm ?? null, rec.lyrics,
     JSON.stringify(rec.collaborators), rec.source, rec.updatedAt, rec.receivedAt]);
  return { record: mapLyrics(r.rows[0]), storage: "postgres" };
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

/* ── Pro Tools sync ──────────────────────────────────────────────────────── */
export type ProToolsRecord = {
  externalTrackId: string; projectId: string; source: string; bpm?: number;
  markers: unknown[]; takeScores: unknown[]; pronunciationFeedback: unknown[]; updatedAt: string; receivedAt: string;
};
let ptReady: Promise<void> | null = null;
async function ensurePtTable(p: Pool): Promise<void> {
  if (!ptReady) ptReady = (async () => {
    await p.query(`CREATE TABLE IF NOT EXISTS collab_protools_sync (
      external_track_id VARCHAR(160) NOT NULL, project_id VARCHAR(160) NOT NULL DEFAULT '__default__',
      source VARCHAR(120) NOT NULL DEFAULT 'protools-companion', bpm INTEGER,
      markers JSONB NOT NULL DEFAULT '[]'::jsonb, take_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
      pronunciation_feedback JSONB NOT NULL DEFAULT '[]'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (external_track_id, project_id));`);
  })();
  return ptReady;
}
const PT_DEFAULT = "__default__";
function mapPt(row: any): ProToolsRecord {
  const bpm = row.bpm == null ? undefined : (Number.isFinite(Number(row.bpm)) ? Math.round(Number(row.bpm)) : undefined);
  const j = (v: unknown) => Array.isArray(v) ? v : (typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return []; } })() : []);
  return {
    externalTrackId: String(row.external_track_id), projectId: String(row.project_id || PT_DEFAULT),
    source: String(row.source || "protools-companion"), bpm, markers: j(row.markers), takeScores: j(row.take_scores),
    pronunciationFeedback: j(row.pronunciation_feedback),
    updatedAt: new Date(row.updated_at || new Date().toISOString()).toISOString(),
    receivedAt: new Date(row.received_at || new Date().toISOString()).toISOString(),
  };
}
export async function upsertProTools(rec: ProToolsRecord): Promise<{ record: ProToolsRecord; storage: string }> {
  const p = getPool();
  if (!p) return { record: rec, storage: "memory" };
  await ensurePtTable(p);
  const r = await p.query(
    `INSERT INTO collab_protools_sync (external_track_id,project_id,source,bpm,markers,take_scores,pronunciation_feedback,updated_at,received_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::timestamptz,$9::timestamptz)
     ON CONFLICT (external_track_id,project_id) DO UPDATE SET source=EXCLUDED.source,bpm=EXCLUDED.bpm,markers=EXCLUDED.markers,
       take_scores=EXCLUDED.take_scores,pronunciation_feedback=EXCLUDED.pronunciation_feedback,updated_at=EXCLUDED.updated_at,
       received_at=EXCLUDED.received_at WHERE collab_protools_sync.updated_at <= EXCLUDED.updated_at RETURNING *`,
    [rec.externalTrackId, rec.projectId || PT_DEFAULT, rec.source, rec.bpm ?? null, JSON.stringify(rec.markers),
     JSON.stringify(rec.takeScores), JSON.stringify(rec.pronunciationFeedback), rec.updatedAt, rec.receivedAt]);
  // ON CONFLICT WHERE kan gi 0 rader (eldre updatedAt) → hent gjeldende.
  if (r.rows[0]) return { record: mapPt(r.rows[0]), storage: "postgres" };
  const cur = await p.query(`SELECT * FROM collab_protools_sync WHERE external_track_id=$1 AND project_id=$2 LIMIT 1`, [rec.externalTrackId, rec.projectId || PT_DEFAULT]);
  return { record: cur.rows[0] ? mapPt(cur.rows[0]) : rec, storage: "postgres" };
}
export async function getProTools(externalTrackId: string, projectId?: string): Promise<{ record: ProToolsRecord | null; storage: string }> {
  const p = getPool();
  if (!p) return { record: null, storage: "memory" };
  await ensurePtTable(p);
  const r = projectId
    ? await p.query(`SELECT * FROM collab_protools_sync WHERE external_track_id=$1 AND project_id=$2 LIMIT 1`, [externalTrackId, projectId])
    : await p.query(`SELECT * FROM collab_protools_sync WHERE external_track_id=$1 ORDER BY updated_at DESC LIMIT 1`, [externalTrackId]);
  return { record: r.rows[0] ? mapPt(r.rows[0]) : null, storage: "postgres" };
}
export async function listProTools(f: { projectId?: string; source?: string; externalTrackId?: string }): Promise<{ records: ProToolsRecord[]; storage: string }> {
  const p = getPool();
  if (!p) return { records: [], storage: "memory" };
  await ensurePtTable(p);
  const where: string[] = []; const params: unknown[] = [];
  for (const [col, val] of [["project_id", f.projectId], ["source", f.source], ["external_track_id", f.externalTrackId]] as const) {
    if (val) { params.push(val); where.push(`${col}=$${params.length}`); }
  }
  const r = await p.query(`SELECT * FROM collab_protools_sync ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY updated_at DESC LIMIT 200`, params);
  return { records: r.rows.map(mapPt), storage: "postgres" };
}
