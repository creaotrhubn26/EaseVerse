import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { isClerkConfigured, requireAuth } from "./_lib/auth.js";
import { recordClaudeUsage } from "./_lib/usage-db.js";

const apiKey = process.env.ANTHROPIC_API_KEY;
const client: Anthropic | null = apiKey ? new Anthropic({ apiKey }) : null;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(20000),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(50),
  system: z.string().max(8000).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let userId: string | null = null;
  if (isClerkConfigured()) {
    userId = await requireAuth(req, res);
    if (!userId) return;
  }

  if (!client) {
    return res.status(503).json({
      error: "Anthropic chat is not configured. Set ANTHROPIC_API_KEY.",
    });
  }

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      ...(parsed.data.system ? { system: parsed.data.system } : {}),
      messages: parsed.data.messages,
    });

    stream.on("text", (delta) => {
      res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
    });

    const final = await stream.finalMessage();
    void recordClaudeUsage({ userId, model: MODEL, usage: final.usage });
    res.write(`data: ${JSON.stringify({ done: true, usage: final.usage })}\n\n`);
    res.end();
  } catch (error) {
    console.error("Chat stream error:", error);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: "Failed to stream chat" });
    }
  }
}
