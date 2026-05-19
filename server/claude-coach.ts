import Anthropic from "@anthropic-ai/sdk";
import { recordClaudeUsage } from "./usage-tracker";

const apiKey = process.env.ANTHROPIC_API_KEY;
const client: Anthropic | null = apiKey ? new Anthropic({ apiKey }) : null;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";

export function isClaudeAvailable(): boolean {
  return client !== null;
}

const PRONOUNCE_SYSTEM_PROMPT =
  "You are a vocal pronunciation coach for singers. " +
  "Given a word and optional lyric context, return concise pronunciation guidance.";

const pronounceTool: Anthropic.Tool = {
  name: "report_pronunciation",
  description: "Return pronunciation guidance for a single word.",
  input_schema: {
    type: "object",
    properties: {
      phonetic: { type: "string", description: "IPA or simple phonetic spelling" },
      tip: { type: "string", description: "One short coaching tip, under 15 words" },
      slow: { type: "string", description: "Syllabified slow pronunciation, e.g. mel-uh-dee" },
    },
    required: ["phonetic", "tip", "slow"],
  },
};

export async function getPronunciationCoaching(params: {
  word: string;
  context?: string;
  language?: string;
  accentGoal?: string;
}): Promise<{ phonetic: string; tip: string; slow: string }> {
  if (!client) {
    throw new Error("Anthropic client is not configured. Set ANTHROPIC_API_KEY.");
  }

  const languageHint = params.language?.trim() || "English";
  const accentHint = params.accentGoal?.trim();
  const userMessage = params.context
    ? `Word: "${params.word}" in lyric line: "${params.context}".${accentHint ? ` Accent goal: ${accentHint}.` : ""} Tip in ${languageHint}.`
    : `Word: "${params.word}".${accentHint ? ` Accent goal: ${accentHint}.` : ""} Tip in ${languageHint}.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: [
      {
        type: "text",
        text: PRONOUNCE_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [pronounceTool],
    tool_choice: { type: "tool", name: pronounceTool.name },
    messages: [{ role: "user", content: userMessage }],
  });

  recordClaudeUsage({ model: MODEL, usage: response.usage });

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === pronounceTool.name) {
      const input = block.input as { phonetic?: unknown; tip?: unknown; slow?: unknown };
      if (
        typeof input.phonetic === "string" &&
        typeof input.tip === "string" &&
        typeof input.slow === "string"
      ) {
        return { phonetic: input.phonetic, tip: input.tip, slow: input.slow };
      }
    }
  }

  throw new Error("Claude did not return pronunciation tool result");
}
