import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { textToSpeech, openai } from "./replit_integrations/audio/client";

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

  app.post("/api/pronounce", async (req: Request, res: Response) => {
    try {
      const { word, context } = req.body;

      if (!word || typeof word !== "string") {
        return res.status(400).json({ error: "Word is required" });
      }

      const contextLine = typeof context === "string" ? context : "";

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a vocal pronunciation coach for singers. Given a word (and optionally the lyric line it appears in), provide:
1. phonetic: A simple phonetic spelling showing how to pronounce it clearly when singing (use easy-to-read phonetics like "ee-KWUHL" not IPA)
2. tip: A short, practical singing tip (max 15 words) about how to pronounce this word clearly
3. slow: The word broken into syllables with hyphens, written how it should sound when sung slowly

Respond in JSON format only: {"phonetic":"...","tip":"...","slow":"..."}`
          },
          {
            role: "user",
            content: contextLine
              ? `Word: "${word}" in the line: "${contextLine}"`
              : `Word: "${word}"`
          }
        ],
        temperature: 0.3,
        max_tokens: 150,
      });

      const raw = completion.choices[0]?.message?.content || "";
      let parsed: { phonetic: string; tip: string; slow: string };
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
      } catch {
        parsed = { phonetic: word, tip: "Enunciate clearly", slow: word };
      }

      const audioBuffer = await textToSpeech(
        parsed.slow,
        "nova",
        "mp3"
      );

      res.json({
        word,
        phonetic: parsed.phonetic,
        tip: parsed.tip,
        slow: parsed.slow,
        audioBase64: audioBuffer.toString("base64"),
      });
    } catch (error) {
      console.error("Pronounce error:", error);
      res.status(500).json({ error: "Failed to generate pronunciation" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
