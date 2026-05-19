import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { isClerkConfigured, requireAuth } from "./_lib/auth.js";
import { recordClaudeUsage } from "./_lib/usage-db.js";

const apiKey = process.env.ANTHROPIC_API_KEY;
const client: Anthropic | null = apiKey ? new Anthropic({ apiKey }) : null;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";

const requestSchema = z.object({
  imageBase64: z.string().min(50),
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]).default("image/png"),
  mode: z.enum(["transcribe", "sections"]).default("transcribe"),
});

const sectionsTool: Anthropic.Tool = {
  name: "return_sections",
  description: "Return song sections parsed from handwritten lyrics.",
  input_schema: {
    type: "object",
    properties: {
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["verse", "pre-chorus", "chorus", "bridge", "final-chorus", "intro", "outro"],
            },
            label: { type: "string" },
            lines: { type: "array", items: { type: "string" } },
          },
          required: ["type", "label", "lines"],
        },
      },
    },
    required: ["sections"],
  },
};

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
    return res.status(503).json({ error: "Anthropic not configured. Set ANTHROPIC_API_KEY." });
  }

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  const { imageBase64, mediaType, mode } = parsed.data;

  try {
    if (mode === "sections") {
      const sectionsResponse = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        tools: [sectionsTool],
        tool_choice: { type: "tool", name: sectionsTool.name },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: imageBase64 },
              },
              {
                type: "text",
                text: 'Identify song sections in this handwritten lyric image. For each section, classify the type (verse, pre-chorus, chorus, bridge, final-chorus, intro, outro), give a short label (e.g. "Verse 1", "Chorus"), and list each lyric line. If no explicit section marker is visible, treat the whole text as a single Verse.',
              },
            ],
          },
        ],
      });

      void recordClaudeUsage({ userId, model: MODEL, usage: sectionsResponse.usage });
      for (const block of sectionsResponse.content) {
        if (block.type === "tool_use" && block.name === sectionsTool.name) {
          return res.status(200).json(block.input);
        }
      }
      return res.status(500).json({ error: "Claude did not return sections" });
    }

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageBase64 },
            },
            {
              type: "text",
              text: "Transcribe the handwriting in this image to plain text. Preserve line breaks. Output only the transcribed text — no commentary, no markdown.",
            },
          ],
        },
      ],
    });

    void recordClaudeUsage({ userId, model: MODEL, usage: response.usage });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return res.status(200).json({ text });
  } catch (error) {
    console.error("Handwriting error:", error);
    return res.status(500).json({ error: "Transcription failed" });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};
