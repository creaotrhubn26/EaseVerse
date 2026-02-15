import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { Pool } from "pg";
import { z } from "zod";
import { buildSessionScoring } from "@shared/session-scoring";
import { registerAudioRoutes } from "./replit_integrations/audio";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerImageRoutes } from "./replit_integrations/image";
import {
  textToSpeech,
  openai,
  speechToText,
  ensureCompatibleFormat,
  hasOpenAiCredentials,
} from "./replit_integrations/audio/client";

const supportedVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
const voiceSchema = z.enum(supportedVoices);

const ttsRequestSchema = z.object({
  text: z.string().trim().min(1).max(500),
  voice: voiceSchema.optional(),
});

const pronounceRequestSchema = z.object({
  word: z.string().trim().min(1).max(60),
  context: z.string().trim().max(280).optional(),
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
});

const collabLyricsUpsertSchema = z.object({
  externalTrackId: z.string().trim().min(1).max(160),
  projectId: z.string().trim().max(160).optional(),
  title: z.string().trim().min(1).max(240),
  artist: z.string().trim().max(160).optional(),
  lyrics: z.string().trim().min(1).max(20000),
  collaborators: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
  source: z.string().trim().max(120).optional(),
  updatedAt: z.string().datetime().optional(),
});

type CollabLyricsRecord = {
  externalTrackId: string;
  projectId?: string;
  title: string;
  artist?: string;
  lyrics: string;
  collaborators: string[];
  source: string;
  updatedAt: string;
  receivedAt: string;
};

const collabLyricsStore = new Map<string, CollabLyricsRecord>();
const collabLyricsDbUrl = process.env.DATABASE_URL?.trim();
const collabLyricsPool = collabLyricsDbUrl
  ? new Pool({
      connectionString: collabLyricsDbUrl,
      max: 5,
      idleTimeoutMillis: 30_000,
    })
  : null;
let collabLyricsTableReadyPromise: Promise<void> | null = null;

type RateWindowState = { count: number; windowStart: number };
const pronounceRateWindow = new Map<string, RateWindowState>();
const scoringRateWindow = new Map<string, RateWindowState>();
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
  return {
    externalTrackId: String(row.external_track_id),
    projectId: row.project_id ? String(row.project_id) : undefined,
    title: String(row.title),
    artist: row.artist ? String(row.artist) : undefined,
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
          lyrics TEXT NOT NULL,
          collaborators JSONB NOT NULL DEFAULT '[]'::jsonb,
          source VARCHAR(120) NOT NULL DEFAULT 'external',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
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
          lyrics,
          collaborators,
          source,
          updated_at,
          received_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::timestamptz, $9::timestamptz)
        ON CONFLICT (external_track_id)
        DO UPDATE SET
          project_id = EXCLUDED.project_id,
          title = EXCLUDED.title,
          artist = EXCLUDED.artist,
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
    return Array.from(collabLyricsStore.values()).filter((item) => {
      if (projectId && item.projectId !== projectId) {
        return false;
      }
      if (source && item.source !== source) {
        return false;
      }
      return true;
    });
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
    return Array.from(collabLyricsStore.values()).filter((item) => {
      if (projectId && item.projectId !== projectId) {
        return false;
      }
      if (source && item.source !== source) {
        return false;
      }
      return true;
    });
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
  envVarName: string
): boolean {
  const expectedKey = process.env[envVarName];
  if (!expectedKey) {
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
  const host = forwardedHost || req.get("host") || "localhost:5000";
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
        "Set EXTERNAL_API_KEY on the server to require external API authentication.",
    },
    endpoints: [
      { method: "GET", path: "/api/v1", description: "API discovery document" },
      { method: "GET", path: "/api/v1/health", description: "Service health check" },
      { method: "POST", path: "/api/v1/tts", description: "Text to speech (mp3 response)" },
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
        path: "/api/v1/collab/lyrics",
        description: "Upsert collaborative lyric draft by external track id",
      },
      {
        method: "GET",
        path: "/api/v1/collab/lyrics/:externalTrackId",
        description: "Get latest collaborative lyric draft for a track",
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
    },
  };
}

function ensureAiConfigured(res: Response): boolean {
  if (hasOpenAiCredentials) {
    return true;
  }

  res.status(503).json({
    error:
      "AI service is not configured. Set AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY.",
  });
  return false;
}

export async function registerRoutes(app: Express): Promise<Server> {
  registerChatRoutes(app, "/api/chat");
  registerAudioRoutes(app, "/api/audio");
  registerImageRoutes(app, "/api/image");

  app.use("/api/v1", (req: Request, res: Response, next) => {
    if (!enforceOptionalApiKey(req, res, "EXTERNAL_API_KEY")) {
      return;
    }
    next();
  });

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
        !enforceOptionalApiKey(req, res, "PRONOUNCE_API_KEY")
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

      const { word, context } = parsedBody.data;
      const contextLine = context || "";

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a vocal pronunciation coach for singers. Return strict JSON with keys: phonetic, tip, slow.",
          },
          {
            role: "user",
            content: contextLine
              ? `Word: "${word}" in lyric line: "${contextLine}". Keep tip under 15 words.`
              : `Word: "${word}". Keep tip under 15 words.`,
          },
        ],
        temperature: 0.2,
        max_tokens: 150,
      });

      const content = completion.choices[0]?.message?.content;
      let resolved = { phonetic: word, tip: "Enunciate clearly", slow: word };
      if (content) {
        try {
          const rawJson = JSON.parse(content);
          const parsedResult = pronounceResultSchema.safeParse(rawJson);
          if (parsedResult.success) {
            resolved = parsedResult.data;
          }
        } catch {
          // Keep fallback values when model output is malformed.
        }
      }

      const audioBuffer = await textToSpeech(resolved.slow, "nova", "mp3");

      res.json({
        word,
        phonetic: resolved.phonetic,
        tip: resolved.tip,
        slow: resolved.slow,
        audioBase64: audioBuffer.toString("base64"),
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
        !enforceOptionalApiKey(req, res, "SESSION_SCORING_API_KEY")
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

      const { lyrics, audioBase64, durationSeconds } = parsedBody.data;
      const rawAudio = Buffer.from(audioBase64, "base64");
      const { buffer: compatibleAudio, format } = await ensureCompatibleFormat(rawAudio);
      const transcript = await speechToText(
        compatibleAudio,
        format === "wav" || format === "mp3" ? format : "wav"
      );

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
        lyrics: data.lyrics,
        collaborators: data.collaborators ?? existing?.collaborators ?? [],
        source: data.source ?? existing?.source ?? "external",
        updatedAt: data.updatedAt ?? new Date().toISOString(),
        receivedAt,
      };

      const persistedRecord = await upsertCollabLyricsRecord(draftRecord);
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

  app.post("/api/v1/collab/lyrics", handleCollabLyricsUpsert);

  app.post("/api/tts", handleTts);
  app.post("/api/v1/tts", handleTts);

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

  const httpServer = createServer(app);

  return httpServer;
}
