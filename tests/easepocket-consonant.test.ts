import test from "node:test";
import assert from "node:assert/strict";
import { scoreConsonantPrecisionFromDecoded } from "../server/easepocket/consonant";

function addBurst(params: {
  samples: Float32Array;
  sampleRate: number;
  atMs: number;
  freqHz?: number;
  durationMs?: number;
  gain?: number;
}) {
  const freqHz = params.freqHz ?? 4000;
  const durationMs = params.durationMs ?? 10;
  const gain = params.gain ?? 0.9;
  const start = Math.max(0, Math.round((params.atMs / 1000) * params.sampleRate));
  const len = Math.max(1, Math.round((durationMs / 1000) * params.sampleRate));
  for (let i = 0; i < len; i += 1) {
    const idx = start + i;
    if (idx >= params.samples.length) break;
    const env = 1 - i / len;
    params.samples[idx] += gain * env * Math.sin((2 * Math.PI * freqHz * i) / params.sampleRate);
  }
}

test("EasePocket consonant scoring aligns on-grid bursts as on-time", () => {
  const sampleRate = 16000;
  const seconds = 2.2;
  const samples = new Float32Array(Math.round(sampleRate * seconds));

  const bpm = 120;
  const stepMs = 60000 / bpm / 4; // 16th
  const phaseMs = 500;

  for (let n = 0; n < 10; n += 1) {
    addBurst({ samples, sampleRate, atMs: phaseMs + n * stepMs });
  }

  const score = scoreConsonantPrecisionFromDecoded({
    decoded: { sampleRate, channels: 1, samples },
    bpm,
    grid: "16th",
    toleranceMs: 15,
    maxEvents: 40,
  });

  assert.ok(score.stats.eventCount >= 6);
  assert.ok(score.stats.meanAbsMs < 15);
  assert.ok(score.stats.onTimePct > 60);
});

test("EasePocket consonant scoring reports a consistent late offset", () => {
  const sampleRate = 16000;
  const seconds = 2.4;
  const samples = new Float32Array(Math.round(sampleRate * seconds));

  const bpm = 100;
  const stepMs = 60000 / bpm / 4; // 16th
  const phaseMs = 400;
  const lateMs = 25;

  for (let n = 0; n < 10; n += 1) {
    // Alternate early/late to create a pocket wobble that cannot be "phase-fit" away.
    const wobble = n % 2 === 0 ? -lateMs : lateMs;
    addBurst({ samples, sampleRate, atMs: phaseMs + n * stepMs + wobble });
  }

  const score = scoreConsonantPrecisionFromDecoded({
    decoded: { sampleRate, channels: 1, samples },
    bpm,
    grid: "16th",
    toleranceMs: 15,
    maxEvents: 40,
  });

  assert.ok(score.stats.eventCount >= 6);
  assert.ok(score.stats.meanAbsMs > 12);
  assert.ok(score.stats.onTimePct < 80);
});
