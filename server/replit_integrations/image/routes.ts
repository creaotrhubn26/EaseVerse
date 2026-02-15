import type { Express, Request, Response } from "express";
import { hasImageAiCredentials, openai } from "./client";

export function registerImageRoutes(app: Express, basePath = "/api/image"): void {
  app.post(`${basePath}/generate`, async (req: Request, res: Response) => {
    try {
      if (!hasImageAiCredentials) {
        return res.status(503).json({
          error:
            "AI image service is not configured. Set AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY.",
        });
      }

      const { prompt, size = "1024x1024" } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const response = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: size as "1024x1024" | "512x512" | "256x256",
      });

      if (!response.data || response.data.length === 0) {
        return res.status(500).json({ error: "No image data returned" });
      }
      const imageData = response.data[0];
      res.json({
        url: imageData.url,
        b64_json: imageData.b64_json,
      });
    } catch (error) {
      console.error("Error generating image:", error);
      res.status(500).json({ error: "Failed to generate image" });
    }
  });
}
