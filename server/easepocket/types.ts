export type EasePocketGrid = "beat" | "8th" | "16th";

export type TimingClass = "early" | "on" | "late";

export type ConsonantTimingEvent = {
  tMs: number;
  expectedMs: number;
  deviationMs: number;
  class: TimingClass;
  confidence: number; // 0..1
};

export type ConsonantTimingStats = {
  eventCount: number;
  onTimePct: number;
  meanAbsMs: number;
  stdDevMs: number;
  avgOffsetMs: number; // positive = late, negative = early
};

export type ConsonantTimingScore = {
  stepMs: number;
  phaseMs: number;
  toleranceMs: number;
  events: ConsonantTimingEvent[];
  stats: ConsonantTimingStats;
};

