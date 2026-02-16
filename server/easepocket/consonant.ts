import type { Buffer } from "node:buffer";
import { decodeWav, type DecodedWav } from "./wav.ts";
import { detectConsonantOnsets } from "./onset.ts";
import { estimatePhaseMs, gridStepMs, scoreOnsets } from "./grid.ts";
import type { ConsonantTimingScore, EasePocketGrid } from "./types.ts";

export function scoreConsonantPrecisionFromDecoded(params: {
  decoded: DecodedWav;
  bpm: number;
  grid: EasePocketGrid;
  toleranceMs?: number;
  maxEvents?: number;
}): ConsonantTimingScore {
  const stepMs = gridStepMs(params.bpm, params.grid);
  const toleranceMs = params.toleranceMs ?? 15;

  const onsets = detectConsonantOnsets({
    samples: params.decoded.samples,
    sampleRate: params.decoded.sampleRate,
    maxOnsets: Math.max(40, Math.min(320, params.maxEvents ?? 220)),
  });

  const onsetMs = onsets.map((o) => o.tMs);
  const phaseMs = estimatePhaseMs({ onsetMs, stepMs, resolutionMs: 1 });

  return scoreOnsets({
    onsetMs: onsets.map((o) => ({ tMs: o.tMs, confidence: o.confidence })),
    stepMs,
    phaseMs,
    toleranceMs,
    maxEvents: params.maxEvents,
  });
}

export function scoreConsonantPrecision(params: {
  wavBuffer: Buffer;
  bpm: number;
  grid: EasePocketGrid;
  toleranceMs?: number;
  maxEvents?: number;
}): ConsonantTimingScore {
  return scoreConsonantPrecisionFromDecoded({
    decoded: decodeWav(params.wavBuffer),
    bpm: params.bpm,
    grid: params.grid,
    toleranceMs: params.toleranceMs,
    maxEvents: params.maxEvents,
  });
}
