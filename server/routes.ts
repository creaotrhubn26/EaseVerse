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

  const providedKey = req.header("x-api-key");
  if (providedKey !== expectedKey) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

export async function registerRoutes(app: Express): Promise<Server> {
  registerChatRoutes(app, "/api/chat");
  registerAudioRoutes(app, "/api/audio");
  registerImageRoutes(app, "/api/image");

  app.post("/api/tts", async (req: Request, res: Response) => {
    try {
      const { text, voice = "nova" } = req.body;

      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Text is required" });
      }

      if (text.length > 500) {
        return res.status(400).json({ error: "Text too long (max 500 chars)" });
      }

      const validVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
      const selectedVoice = validVoices.includes(voice) ? voice : "nova";

      const audioBuffer = await textToSpeech(text, selectedVoice, "mp3");

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", audioBuffer.length.toString());
      res.send(audioBuffer);
    } catch (error) {
      console.error("TTS error:", error);
      res.status(500).json({ error: "Failed to generate speech" });
    }
  });

  app.post("/api/pronounce", async (req: Request, res: Response) => {
    try {
      if (!enforceOptionalApiKey(req, res, "PRONOUNCE_API_KEY")) {
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
  });

  app.post("/api/session-score", async (req: Request, res: Response) => {
    try {
      if (!enforceOptionalApiKey(req, res, "SESSION_SCORING_API_KEY")) {
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
  });

  const httpServer = createServer(app);

  return httpServer;
}
