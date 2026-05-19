import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { recordClaudeUsage } from "./usage-db.js";

export type PronounceResult = { phonetic: string; tip: string; slow: string };
export type PronounceParams = {
  word: string;
  context?: string;
  language?: string;
  accentGoal?: string;
};

// --- Claude ---

const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const anthropic: Anthropic | null = anthropicApiKey
  ? new Anthropic({ apiKey: anthropicApiKey })
  : null;
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";

export function isClaudeAvailable(): boolean {
  return anthropic !== null;
}

const pronounceTool: Anthropic.Tool = {
  name: "report_pronunciation",
  description: "Return pronunciation guidance for a single word.",
  input_schema: {
    type: "object",
    properties: {
      phonetic: { type: "string", description: "IPA or simple phonetic spelling" },
      tip: { type: "string", description: "One short coaching tip, under 15 words" },
      slow: { type: "string", description: "Syllabified slow pronunciation" },
    },
    required: ["phonetic", "tip", "slow"],
  },
};

async function claudeCoach(params: PronounceParams, userId?: string | null): Promise<PronounceResult> {
  if (!anthropic) throw new Error("Anthropic not configured");
  const languageHint = params.language?.trim() || "English";
  const accentHint = params.accentGoal?.trim();
  const userMessage = params.context
    ? `Word: "${params.word}" in lyric line: "${params.context}".${accentHint ? ` Accent goal: ${accentHint}.` : ""} Tip in ${languageHint}.`
    : `Word: "${params.word}".${accentHint ? ` Accent goal: ${accentHint}.` : ""} Tip in ${languageHint}.`;

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    system: [
      {
        type: "text",
        text: "You are a vocal pronunciation coach for singers. Given a word and optional lyric context, return concise pronunciation guidance.",
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [pronounceTool],
    tool_choice: { type: "tool", name: pronounceTool.name },
    messages: [{ role: "user", content: userMessage }],
  });

  void recordClaudeUsage({ userId: userId ?? null, model: CLAUDE_MODEL, usage: response.usage });

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
  throw new Error("Claude did not return tool result");
}

// --- Gemini ---

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const gemini: GoogleGenerativeAI | null = geminiApiKey
  ? new GoogleGenerativeAI(geminiApiKey)
  : null;

export function isGeminiAvailable(): boolean {
  return gemini !== null;
}

async function geminiCoach(params: PronounceParams): Promise<PronounceResult> {
  if (!gemini) throw new Error("Gemini not configured");
  const model = gemini.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
  });
  const languageHint = params.language?.trim() || "English";
  const accentHint = params.accentGoal?.trim();
  const contextPrompt = params.context
    ? `Word: "${params.word}" in lyric line: "${params.context}".${accentHint ? ` Accent goal: ${accentHint}.` : ""}`
    : `Word: "${params.word}".${accentHint ? ` Accent goal: ${accentHint}.` : ""}`;
  const prompt = `You are a vocal pronunciation coach for singers. For the word below, return strict JSON with keys phonetic, tip, slow. Tip must be in ${languageHint} and under 15 words.\n\n${contextPrompt}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Gemini did not return JSON");
  const parsed = JSON.parse(jsonMatch[0]) as { phonetic?: unknown; tip?: unknown; slow?: unknown };
  if (
    typeof parsed.phonetic !== "string" ||
    typeof parsed.tip !== "string" ||
    typeof parsed.slow !== "string"
  ) {
    throw new Error("Gemini returned invalid shape");
  }
  return { phonetic: parsed.phonetic, tip: parsed.tip, slow: parsed.slow };
}

// --- Provider chain ---

export async function coachPronunciation(
  params: PronounceParams,
  userId?: string | null,
): Promise<PronounceResult> {
  const providers: Array<{
    name: string;
    available: boolean;
    call: (params: PronounceParams, userId?: string | null) => Promise<PronounceResult>;
  }> = [
    { name: "gemini", available: isGeminiAvailable(), call: (p) => geminiCoach(p) },
    { name: "claude", available: isClaudeAvailable(), call: (p, u) => claudeCoach(p, u) },
  ];

  let lastError: unknown;
  for (const provider of providers) {
    if (!provider.available) continue;
    try {
      return await provider.call(params, userId);
    } catch (error) {
      lastError = error;
      console.warn(`Provider ${provider.name} failed:`, error);
    }
  }
  if (lastError) throw lastError;
  return { phonetic: params.word, tip: "Enunciate clearly", slow: params.word };
}
