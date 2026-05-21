import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { analyzeWavBuffer } from "./audio-analysis.js";
import {
  getTakeWithAnalysis,
  listTakesForUser,
  markTakeDone,
  markTakeError,
  markTakeProcessing,
  upsertTakeAnalysis,
  type TakeRow,
} from "./takes-db.js";
import { recordClaudeUsage } from "./usage-db.js";

const anthropicKey = process.env.ANTHROPIC_API_KEY;
const claudeClient: Anthropic | null = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";

const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const openaiClient: OpenAI | null = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

export type TranscriptWord = { word: string; start: number; end: number };

async function transcribeWithOpenAi(
  buffer: Uint8Array,
  filename: string,
): Promise<{ text: string; words: TranscriptWord[] } | null> {
  if (!openaiClient) return null;
  try {
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    const file = new File([arrayBuffer], filename, { type: "audio/wav" });
    const result = await openaiClient.audio.transcriptions.create({
      file,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });
    const text = typeof result === "string" ? result : (result as { text?: string }).text ?? "";
    const rawWords =
      typeof result === "object" && result !== null && Array.isArray((result as { words?: unknown[] }).words)
        ? ((result as { words: Array<{ word: string; start: number; end: number }> }).words)
        : [];
    return {
      text,
      words: rawWords.map((w) => ({ word: String(w.word ?? ""), start: Number(w.start ?? 0), end: Number(w.end ?? 0) })),
    };
  } catch (error) {
    console.warn("Whisper transcription failed:", error);
    return null;
  }
}

type ClaudeNotes = {
  notes: string;
  timingScore: number | null;
  pronunciationScore: number | null;
};

async function generateClaudeNotes(args: {
  filename: string;
  durationSec: number | null;
  pitchMeanHz: number | null;
  pitchStddevCents: number | null;
  energyAvgDb: number | null;
  transcript: string | null;
  otherTakes: { filename: string; pitchMeanHz: number | null; energyAvgDb: number | null; transcript: string | null }[];
  userId: string;
}): Promise<ClaudeNotes | null> {
  if (!claudeClient) return null;
  const otherTakesSummary = args.otherTakes.length
    ? args.otherTakes
        .slice(0, 5)
        .map(
          (t, i) =>
            `Take ${i + 1} (${t.filename}): pitch ${t.pitchMeanHz?.toFixed(0) ?? "?"} Hz, ` +
            `energy ${t.energyAvgDb?.toFixed(1) ?? "?"} dB${t.transcript ? `, transcript: "${t.transcript.slice(0, 100)}…"` : ""}`,
        )
        .join("\n")
    : "(no other takes in this group)";

  const tool: Anthropic.Tool = {
    name: "report_take",
    description: "Return concise producer notes on a vocal take.",
    input_schema: {
      type: "object",
      properties: {
        notes: {
          type: "string",
          description: "One or two sentences. Highlight what makes this take stand out vs others.",
        },
        timing_score: { type: "integer", minimum: 0, maximum: 100 },
        pronunciation_score: { type: "integer", minimum: 0, maximum: 100 },
      },
      required: ["notes"],
    },
  };

  try {
    const response = await claudeClient.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      system:
        "You are a vocal producer assistant. Given a take's audio stats and transcript, summarise feel + technical quality in 1-2 sentences. Recommend if it's a comp candidate.",
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `Current take: ${args.filename}\n` +
                `Duration: ${args.durationSec?.toFixed(1) ?? "?"} sec\n` +
                `Pitch mean: ${args.pitchMeanHz?.toFixed(0) ?? "?"} Hz\n` +
                `Pitch stddev: ${args.pitchStddevCents ?? "?"} cents\n` +
                `Energy avg: ${args.energyAvgDb?.toFixed(1) ?? "?"} dB\n` +
                `Transcript: ${args.transcript ? `"${args.transcript.slice(0, 600)}"` : "(none — Whisper not configured or failed)"}\n\n` +
                `Earlier takes in this group:\n${otherTakesSummary}\n\n` +
                `Write producer notes for the current take.`,
            },
          ],
        },
      ],
    });
    recordClaudeUsage({ userId: args.userId, model: CLAUDE_MODEL, usage: response.usage });
    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === tool.name) {
        const input = block.input as {
          notes?: unknown;
          timing_score?: unknown;
          pronunciation_score?: unknown;
        };
        return {
          notes: typeof input.notes === "string" ? input.notes : "",
          timingScore: typeof input.timing_score === "number" ? input.timing_score : null,
          pronunciationScore: typeof input.pronunciation_score === "number" ? input.pronunciation_score : null,
        };
      }
    }
    return null;
  } catch (error) {
    console.warn("Claude take notes failed:", error);
    return null;
  }
}

export async function processTake(take: TakeRow): Promise<void> {
  await markTakeProcessing(take.id);
  try {
    const response = await fetch(take.storageUrl);
    if (!response.ok) throw new Error(`Blob download failed: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const analysis = analyzeWavBuffer(buffer);
    const transcribed = await transcribeWithOpenAi(buffer, take.filename);
    const transcript = transcribed?.text ?? null;
    const words = transcribed?.words ?? [];

    let aiNotes: ClaudeNotes | null = null;
    if (take.externalTrackId) {
      const groupTakes = (await listTakesForUser(take.userId, 50))
        .filter((t) => t.externalTrackId === take.externalTrackId && t.id !== take.id);
      const otherWithAnalyses = await Promise.all(
        groupTakes.slice(0, 5).map(async (t) => {
          const withAnalysis = await getTakeWithAnalysis(t.id);
          return {
            filename: t.filename,
            pitchMeanHz: withAnalysis?.analysis?.pitchMeanHz ?? null,
            energyAvgDb: withAnalysis?.analysis?.energyAvgDb ?? null,
            transcript: withAnalysis?.analysis?.transcript ?? null,
          };
        }),
      );
      aiNotes = await generateClaudeNotes({
        filename: take.filename,
        durationSec: analysis.durationSec,
        pitchMeanHz: analysis.pitchMeanHz,
        pitchStddevCents: analysis.pitchStddevCents,
        energyAvgDb: analysis.energyAvgDb,
        transcript,
        otherTakes: otherWithAnalyses,
        userId: take.userId,
      });
    }

    await upsertTakeAnalysis({
      takeId: take.id,
      transcript,
      transcriptWords: words.length > 0 ? words : null,
      pitchMeanHz: analysis.pitchMeanHz,
      pitchStddevCents: analysis.pitchStddevCents,
      energyAvgDb: analysis.energyAvgDb,
      energyStddevDb: analysis.energyStddevDb,
      timingScore: aiNotes?.timingScore ?? null,
      pronunciationScore: aiNotes?.pronunciationScore ?? null,
      aiNotes: aiNotes?.notes ?? null,
    });

    await markTakeDone(take.id, analysis.durationSec);

    if (take.externalTrackId) {
      try {
        const { rankAndMarkBestTake } = await import("./take-grouping.js");
        await rankAndMarkBestTake(take.userId, take.externalTrackId);
      } catch (err) {
        console.warn("rankAndMarkBestTake failed:", (err as Error).message);
      }
    }
  } catch (error) {
    console.error("Process take failed:", error);
    await markTakeError(take.id, (error as Error).message || "Unknown error");
  }
}
