import FFT from "fft.js";
import { clamp, mad, median } from "./utils.ts";
import { preprocessForOnsetDetection } from "./preprocess.ts";

export type DetectedOnset = {
  tMs: number;
  strength: number;
  confidence: number; // 0..1
};

type DetectorConfig = {
  frameSize: number;
  hopSize: number;
  minSpacingMs: number;
  refineWindowMs: number;
  hfMinHz: number;
  hfMaxHz: number;
  fluxMadMultiplier: number;
  energyMadMultiplier: number;
};

const defaultConfig: DetectorConfig = {
  frameSize: 256,
  hopSize: 64,
  minSpacingMs: 60,
  refineWindowMs: 20,
  hfMinHz: 2000,
  hfMaxHz: 8000,
  fluxMadMultiplier: 6,
  energyMadMultiplier: 4,
};

function hannWindow(size: number): Float32Array {
  const out = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    out[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return out;
}

function binForHz(hz: number, sampleRate: number, fftSize: number): number {
  return Math.round((hz * fftSize) / sampleRate);
}

export function detectConsonantOnsets(params: {
  samples: Float32Array;
  sampleRate: number;
  maxOnsets?: number;
  config?: Partial<DetectorConfig>;
}): DetectedOnset[] {
  const config: DetectorConfig = { ...defaultConfig, ...(params.config ?? {}) };
  const { frameSize, hopSize } = config;

  if (params.sampleRate <= 0) {
    throw new Error("Invalid sample rate");
  }
  if (params.samples.length < frameSize) {
    return [];
  }

  const sampleRate = params.sampleRate;
  const processed = preprocessForOnsetDetection(params.samples, sampleRate);

  const fft = new FFT(frameSize);
  const spectrum = fft.createComplexArray();
  const window = hannWindow(frameSize);

  const halfBins = Math.floor(frameSize / 2);
  const hfMinBin = clamp(binForHz(config.hfMinHz, sampleRate, frameSize), 0, halfBins);
  const hfMaxBin = clamp(binForHz(config.hfMaxHz, sampleRate, frameSize), 0, halfBins);

  const prevPower = new Float32Array(halfBins + 1);
  const frame = new Float32Array(frameSize);

  const frameCount = Math.floor((processed.length - frameSize) / hopSize) + 1;
  const flux = new Float32Array(frameCount);
  const energy = new Float32Array(frameCount);

  for (let fi = 0; fi < frameCount; fi += 1) {
    const start = fi * hopSize;

    let e = 0;
    for (let i = 0; i < frameSize; i += 1) {
      const s = processed[start + i] ?? 0;
      const w = s * window[i];
      frame[i] = w;
      e += w * w;
    }
    energy[fi] = e;

    fft.realTransform(spectrum, frame);
    fft.completeSpectrum(spectrum);

    let f = 0;
    for (let k = hfMinBin; k <= hfMaxBin; k += 1) {
      const re = spectrum[2 * k] ?? 0;
      const im = spectrum[2 * k + 1] ?? 0;
      const power = re * re + im * im;
      const diff = power - prevPower[k];
      if (diff > 0) {
        f += diff;
      }
      prevPower[k] = power;
    }
    flux[fi] = f;
  }

  const fluxMed = median(flux);
  const fluxMad = mad(flux, fluxMed);
  const fluxThreshold =
    fluxMad > 0
      ? fluxMed + config.fluxMadMultiplier * fluxMad
      : fluxMed > 0
        ? fluxMed * 1.5
        : 0;

  const deltaEnergy = new Float32Array(frameCount);
  for (let i = 1; i < frameCount; i += 1) {
    const d = (energy[i] ?? 0) - (energy[i - 1] ?? 0);
    deltaEnergy[i] = d > 0 ? d : 0;
  }

  const deltaMed = median(deltaEnergy);
  const deltaMad = mad(deltaEnergy, deltaMed);
  const energyThreshold =
    deltaMad > 0
      ? deltaMed + config.energyMadMultiplier * deltaMad
      : deltaMed > 0
        ? deltaMed * 1.5
        : 0;

  const hopMs = (hopSize / sampleRate) * 1000;
  const minSpacingFrames = Math.max(1, Math.round(config.minSpacingMs / hopMs));
  const refineWindowSamples = Math.max(1, Math.round((config.refineWindowMs / 1000) * sampleRate));

  const candidates: Array<{ frameIndex: number; strength: number; confidence: number }> = [];
  let lastAccepted = -Infinity;

  // Peak pick on spectral flux with energy-rise confirmation.
  for (let i = 1; i < frameCount - 1; i += 1) {
    const f = flux[i] ?? 0;
    if (f <= fluxThreshold) continue;
    if (f <= (flux[i - 1] ?? 0) || f < (flux[i + 1] ?? 0)) continue;
    if ((deltaEnergy[i] ?? 0) < energyThreshold) continue;
    if (i - lastAccepted < minSpacingFrames) continue;

    const rawConf = fluxThreshold > 0 ? (f - fluxThreshold) / (fluxThreshold * 2) : 0.5;
    const confidence = clamp(rawConf, 0, 1);
    candidates.push({ frameIndex: i, strength: f, confidence });
    lastAccepted = i;
  }

  if (candidates.length === 0) {
    return [];
  }

  const maxOnsets = params.maxOnsets ?? 120;
  let selected = candidates;
  if (selected.length > maxOnsets) {
    selected = [...selected]
      .sort((a, b) => b.strength - a.strength)
      .slice(0, maxOnsets)
      .sort((a, b) => a.frameIndex - b.frameIndex);
  }

  const results: DetectedOnset[] = [];
  for (const cand of selected) {
    const approxSample = cand.frameIndex * hopSize + Math.floor(frameSize / 2);
    const start = Math.max(1, approxSample - refineWindowSamples);
    const end = Math.min(processed.length - 1, approxSample + refineWindowSamples);

    let bestIdx = approxSample;
    let bestScore = -Infinity;
    for (let n = start; n <= end; n += 1) {
      const d = Math.abs((processed[n] ?? 0) - (processed[n - 1] ?? 0));
      if (d > bestScore) {
        bestScore = d;
        bestIdx = n;
      }
    }

    const tMs = (bestIdx / sampleRate) * 1000;
    if (tMs < 30) {
      continue;
    }

    results.push({ tMs, strength: cand.strength, confidence: cand.confidence });
  }

  // De-duplicate refined onsets: refinement can move nearby peaks closer than the
  // peak-picking spacing. Keep the strongest onset within each spacing window.
  results.sort((a, b) => a.tMs - b.tMs);
  const deduped: DetectedOnset[] = [];
  for (const onset of results) {
    const last = deduped[deduped.length - 1];
    if (!last || onset.tMs - last.tMs >= config.minSpacingMs) {
      deduped.push(onset);
      continue;
    }
    if (onset.strength > last.strength) {
      deduped[deduped.length - 1] = onset;
    }
  }

  return deduped;
}
