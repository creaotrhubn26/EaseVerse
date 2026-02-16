import { z } from "zod";
import { getApiHeaders, getApiUrl } from "@/lib/query-client";

export type EasePocketGrid = "beat" | "8th" | "16th";

export type ConsonantTimingClass = "early" | "on" | "late";

export type ConsonantTimingEvent = {
  tMs: number;
  expectedMs: number;
  deviationMs: number;
  class: ConsonantTimingClass;
  confidence: number;
};

export type ConsonantTimingStats = {
  eventCount: number;
  onTimePct: number;
  meanAbsMs: number;
  stdDevMs: number;
  avgOffsetMs: number;
};

export type ConsonantScoreResponse = {
  ok: boolean;
  durationSeconds: number;
  stepMs: number;
  phaseMs: number;
  toleranceMs: number;
  events: ConsonantTimingEvent[];
  stats: ConsonantTimingStats;
};

const eventSchema = z.object({
  tMs: z.number(),
  expectedMs: z.number(),
  deviationMs: z.number(),
  class: z.enum(["early", "on", "late"]),
  confidence: z.number(),
});

const responseSchema = z.object({
  ok: z.boolean(),
  durationSeconds: z.number(),
  stepMs: z.number(),
  phaseMs: z.number(),
  toleranceMs: z.number(),
  events: z.array(eventSchema),
  stats: z.object({
    eventCount: z.number(),
    onTimePct: z.number(),
    meanAbsMs: z.number(),
    stdDevMs: z.number(),
    avgOffsetMs: z.number(),
  }),
});

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const value = reader.result;
      if (typeof value !== "string") {
        reject(new Error("Failed to read recording data"));
        return;
      }
      const base64 = value.includes(",") ? value.split(",")[1] : value;
      resolve(base64);
    };
    reader.onerror = () =>
      reject(reader.error || new Error("Failed to read recording data"));
    reader.readAsDataURL(blob);
  });
}

async function recordingUriToBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to read recording file: ${response.status}`);
  }
  const blob = await response.blob();
  return blobToBase64(blob);
}

export async function analyzeConsonantPrecision(params: {
  recordingUri: string;
  bpm: number;
  grid: EasePocketGrid;
  toleranceMs?: number;
  maxEvents?: number;
}): Promise<ConsonantScoreResponse | null> {
  const { recordingUri, bpm, grid, toleranceMs, maxEvents } = params;
  if (!recordingUri) {
    return null;
  }

  try {
    const audioBase64 = await recordingUriToBase64(recordingUri);
    const url = new URL("/api/v1/easepocket/consonant-score", getApiUrl());
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: getApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        audioBase64,
        bpm,
        grid,
        toleranceMs,
        maxEvents,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as unknown;
    const parsed = responseSchema.safeParse(json);
    if (!parsed.success) {
      return null;
    }
    return parsed.data;
  } catch (error) {
    console.error("EasePocket consonant request failed:", error);
    return null;
  }
}

