import type {
  ConsonantTimingEvent,
  ConsonantTimingScore,
  EasePocketGrid,
} from "./types.ts";
import { clamp, mean, stdDev } from "./utils.ts";

export function gridStepMs(bpm: number, grid: EasePocketGrid): number {
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new Error("Invalid BPM");
  }
  const beatMs = 60000 / bpm;
  if (grid === "beat") return beatMs;
  if (grid === "8th") return beatMs / 2;
  return beatMs / 4;
}

function nearestGridPoint(params: {
  tMs: number;
  stepMs: number;
  phaseMs: number;
}): { expectedMs: number; deviationMs: number } {
  const { tMs, stepMs, phaseMs } = params;
  const k = Math.round((tMs - phaseMs) / stepMs);
  const expectedMs = phaseMs + k * stepMs;
  const deviationMs = tMs - expectedMs;
  return { expectedMs, deviationMs };
}

export function estimatePhaseMs(params: {
  onsetMs: number[];
  stepMs: number;
  resolutionMs?: number;
}): number {
  const { onsetMs, stepMs } = params;
  if (onsetMs.length === 0) {
    return 0;
  }

  const resolutionMs = Math.max(0.5, params.resolutionMs ?? 1);
  const maxPhase = Math.max(resolutionMs, stepMs);

  let bestPhase = 0;
  let bestCost = Number.POSITIVE_INFINITY;

  for (let phase = 0; phase < maxPhase; phase += resolutionMs) {
    let cost = 0;
    for (const tMs of onsetMs) {
      const { deviationMs } = nearestGridPoint({ tMs, stepMs, phaseMs: phase });
      cost += Math.abs(deviationMs);
    }
    cost /= onsetMs.length;

    if (cost < bestCost) {
      bestCost = cost;
      bestPhase = phase;
    }
  }

  return bestPhase;
}

export function scoreOnsets(params: {
  onsetMs: Array<{ tMs: number; confidence: number }>;
  stepMs: number;
  phaseMs: number;
  toleranceMs: number;
  maxEvents?: number;
}): ConsonantTimingScore {
  const { onsetMs, stepMs, phaseMs, toleranceMs } = params;
  const maxEvents = params.maxEvents ?? 180;

  const events: ConsonantTimingEvent[] = [];
  for (const onset of onsetMs.slice(0, maxEvents)) {
    const { expectedMs, deviationMs } = nearestGridPoint({
      tMs: onset.tMs,
      stepMs,
      phaseMs,
    });

    const absDev = Math.abs(deviationMs);
    const cls =
      absDev <= toleranceMs ? "on" : deviationMs < 0 ? "early" : "late";
    const proximity = 1 - clamp(absDev / Math.max(1, stepMs / 2), 0, 1);
    const confidence = clamp(onset.confidence * (0.55 + 0.45 * proximity), 0, 1);

    events.push({
      tMs: onset.tMs,
      expectedMs,
      deviationMs,
      class: cls,
      confidence,
    });
  }

  const deviations = events.map((e) => e.deviationMs);
  const absDeviations = deviations.map((d) => Math.abs(d));

  const avgOffsetMs = mean(deviations);
  const meanAbsMs = mean(absDeviations);
  const stdDevMs = stdDev(deviations, avgOffsetMs);
  const onTimeCount = events.filter((e) => e.class === "on").length;
  const onTimePct = events.length > 0 ? (onTimeCount / events.length) * 100 : 0;

  return {
    stepMs,
    phaseMs,
    toleranceMs,
    events,
    stats: {
      eventCount: events.length,
      onTimePct,
      meanAbsMs,
      stdDevMs,
      avgOffsetMs,
    },
  };
}
