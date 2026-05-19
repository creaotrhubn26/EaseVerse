import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { coachPronunciation } from "./_lib/coaching.js";
import { isClerkConfigured, requireAuth } from "./_lib/auth.js";

const requestSchema = z.object({
  word: z.string().trim().min(1).max(80),
  context: z.string().trim().max(400).optional(),
  language: z.string().trim().max(40).optional(),
  accentGoal: z.string().trim().max(80).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (isClerkConfigured()) {
    const userId = await requireAuth(req, res);
    if (!userId) return;
  }

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  try {
    const result = await coachPronunciation(parsed.data);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Pronounce error:", error);
    return res.status(500).json({
      error: "Failed to coach pronunciation",
      fallback: { phonetic: parsed.data.word, tip: "Enunciate clearly", slow: parsed.data.word },
    });
  }
}
