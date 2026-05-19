// Minimal Node-side audio analysis for vocal takes. Operates on the bytes of a
// WAV/AIFF blob downloaded from storage. For unsupported formats the pipeline
// records only metadata + transcript (Whisper handles MP3 etc. natively).

import wavefilePkg from "wavefile";

const { WaveFile } = wavefilePkg as unknown as {
  WaveFile: new (buffer?: Uint8Array) => {
    fromBuffer: (buffer: Uint8Array) => void;
    toBitDepth: (depth: string) => void;
    toSampleRate: (rate: number) => void;
    fmt: { sampleRate: number; numChannels: number };
    getSamples: (interleaved?: boolean) => Float64Array | Float64Array[];
  };
};

export type AudioAnalysisResult = {
  durationSec: number | null;
  pitchMeanHz: number | null;
  pitchStddevCents: number | null;
  energyAvgDb: number | null;
  energyStddevDb: number | null;
};

function tryDecodeWav(buffer: Uint8Array): { samples: Float32Array; sampleRate: number } | null {
  try {
    const wav = new WaveFile(buffer);
    wav.toBitDepth("32f");
    const sr = wav.fmt.sampleRate;
    const raw = wav.getSamples(true);
    let mono: Float32Array;
    if (Array.isArray(raw)) {
      const channels = raw as Float64Array[];
      const len = channels[0]?.length ?? 0;
      mono = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        let sum = 0;
        for (let c = 0; c < channels.length; c++) sum += channels[c][i] ?? 0;
        mono[i] = sum / channels.length;
      }
    } else {
      mono = new Float32Array((raw as Float64Array).length);
      for (let i = 0; i < mono.length; i++) mono[i] = (raw as Float64Array)[i];
    }
    return { samples: mono, sampleRate: sr };
  } catch {
    return null;
  }
}

function autoCorrelate(buf: Float32Array, sampleRate: number): number | null {
  const SIZE = buf.length;
  let sumSquares = 0;
  for (let i = 0; i < SIZE; i++) sumSquares += buf[i] * buf[i];
  const rms = Math.sqrt(sumSquares / SIZE);
  if (rms < 0.01) return null;

  const minLag = Math.floor(sampleRate / 800);
  const maxLag = Math.floor(sampleRate / 60);
  let bestLag = -1;
  let bestCorr = 0;
  for (let lag = minLag; lag < maxLag && lag < SIZE; lag++) {
    let corr = 0;
    for (let i = 0; i < SIZE - lag; i++) corr += buf[i] * buf[i + lag];
    corr /= SIZE - lag;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  if (bestLag < 1 || bestCorr < 0.3) return null;
  return sampleRate / bestLag;
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function analyzeWavBuffer(buffer: Uint8Array): AudioAnalysisResult {
  const decoded = tryDecodeWav(buffer);
  if (!decoded) {
    return {
      durationSec: null,
      pitchMeanHz: null,
      pitchStddevCents: null,
      energyAvgDb: null,
      energyStddevDb: null,
    };
  }
  const { samples, sampleRate } = decoded;
  const durationSec = samples.length / sampleRate;

  // Pitch: windowed autocorrelation, 25 windows over the audio.
  const windowSize = Math.min(2048, Math.floor(samples.length / 25));
  const stepCount = 25;
  const stride = Math.max(windowSize, Math.floor((samples.length - windowSize) / stepCount));
  const pitchesHz: number[] = [];
  for (let start = 0; start + windowSize <= samples.length; start += stride) {
    const window = samples.subarray(start, start + windowSize);
    const hz = autoCorrelate(window, sampleRate);
    if (hz && hz >= 60 && hz <= 1500) pitchesHz.push(hz);
  }

  const pitchMeanHz = pitchesHz.length > 0 ? pitchesHz.reduce((s, v) => s + v, 0) / pitchesHz.length : null;
  let pitchStddevCents: number | null = null;
  if (pitchesHz.length >= 4 && pitchMeanHz) {
    const cents = pitchesHz.map((hz) => 1200 * Math.log2(hz / pitchMeanHz));
    pitchStddevCents = stddev(cents);
  }

  // Energy: RMS dB over 200ms windows.
  const energyWindow = Math.max(1024, Math.floor(sampleRate * 0.2));
  const energies: number[] = [];
  for (let start = 0; start + energyWindow <= samples.length; start += energyWindow) {
    let sum = 0;
    for (let i = 0; i < energyWindow; i++) {
      const v = samples[start + i];
      sum += v * v;
    }
    const rms = Math.sqrt(sum / energyWindow);
    if (rms > 0) energies.push(20 * Math.log10(rms));
  }
  const energyAvgDb = energies.length > 0 ? energies.reduce((s, v) => s + v, 0) / energies.length : null;
  const energyStddevDb = energies.length > 0 ? stddev(energies) : null;

  return {
    durationSec,
    pitchMeanHz: pitchMeanHz ? Math.round(pitchMeanHz * 100) / 100 : null,
    pitchStddevCents: pitchStddevCents !== null ? Math.round(pitchStddevCents) : null,
    energyAvgDb: energyAvgDb !== null ? Math.round(energyAvgDb * 10) / 10 : null,
    energyStddevDb: energyStddevDb !== null ? Math.round(energyStddevDb * 10) / 10 : null,
  };
}
