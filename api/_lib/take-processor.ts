import { soundRoomContext, soundRoomStorage } from "./creatorhub-storage.js";
import OpenAI from "openai";
import { analyzeWavBuffer } from "./audio-analysis.js";
import {
  markTakeDone,
  markTakeError,
  markTakeProcessing,
  upsertTakeAnalysis,
  type TakeRow,
} from "./takes-db.js";
import { measuredTakeNotes } from "./coaching-evidence.js";

const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const openaiClient: OpenAI | null = openaiKey ? new OpenAI({ apiKey: openaiKey, timeout: 15_000, maxRetries: 0 }) : null;

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

export async function processTake(take: TakeRow): Promise<void> {
  await markTakeProcessing(take.id);
  try {
    let audioUrl = take.storageUrl;
    if (/^[a-f0-9-]{36}$/i.test(take.id)) {
      const context = await soundRoomContext(take.projectId, take.userId, true);
      if (!context) throw new Error('Linked Sound Room access unavailable');
      const playback = await soundRoomStorage(`${take.id}/playback`, context);
      if (typeof playback.url !== 'string' || !playback.url.startsWith('https://')) throw new Error('Invalid audio playback');
      audioUrl = playback.url;
    }
    const response = await fetch(audioUrl, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Blob download failed: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const analysis = analyzeWavBuffer(buffer);
    const transcribed = await transcribeWithOpenAi(buffer, take.filename);
    const transcript = transcribed?.text ?? null;
    const words = transcribed?.words ?? [];

    await upsertTakeAnalysis({
      takeId: take.id,
      transcript,
      transcriptWords: words.length > 0 ? words : null,
      pitchMeanHz: analysis.pitchMeanHz,
      pitchStddevCents: analysis.pitchStddevCents,
      energyAvgDb: analysis.energyAvgDb,
      energyStddevDb: analysis.energyStddevDb,
      timingScore: null,
      pronunciationScore: null,
      aiNotes: measuredTakeNotes(analysis.energyAvgDb),
      bestTakeInGroup: false,
    });

    await markTakeDone(take.id, analysis.durationSec);

  } catch (error) {
    console.error("Process take failed:", error);
    await markTakeError(take.id, (error as Error).message || "Unknown error");
  }
}
