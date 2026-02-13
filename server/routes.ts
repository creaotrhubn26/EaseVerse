import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { textToSpeech } from "./replit_integrations/audio/client";

export async function registerRoutes(app: Express): Promise<Server> {
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

  const httpServer = createServer(app);

  return httpServer;
}
