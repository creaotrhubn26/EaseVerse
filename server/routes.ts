import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
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

type RateWindowState = { count: number; windowStart: number };
const pronounceRateWindow = new Map<string, RateWindowState>();
const scoringRateWindow = new Map<string, RateWindowState>();

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
  const forwardedFor = req.header("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.ip || "unknown";
}

function isRateLimited(
  bucket: Map<string, RateWindowState>,
  key: string,
  maxPerWindow: number,
  windowMs: number
): boolean {
  const now = Date.now();
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
    },
  };
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
