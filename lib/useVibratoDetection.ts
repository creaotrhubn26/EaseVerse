import { useEffect, useRef, useState } from 'react';
import type { PitchReading } from './usePitchDetection';

export type VibratoReading = {
  rateHz: number | null;
  depthCents: number | null;
  active: boolean;
  intensity: 'none' | 'subtle' | 'expressive' | 'wide';
};

const NONE: VibratoReading = {
  rateHz: null,
  depthCents: null,
  active: false,
  intensity: 'none',
};

const WINDOW_SAMPLES = 24; // ~2.4s at 10Hz pitch sample rate

function dominantFrequency(values: number[], sampleHz: number): number | null {
  if (values.length < 8) return null;
  const N = values.length;
  let maxAmp = 0;
  let maxK = 0;
  for (let k = 1; k <= Math.floor(N / 2); k++) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < N; n++) {
      const phase = (-2 * Math.PI * k * n) / N;
      re += values[n] * Math.cos(phase);
      im += values[n] * Math.sin(phase);
    }
    const amp = Math.sqrt(re * re + im * im);
    if (amp > maxAmp) {
      maxAmp = amp;
      maxK = k;
    }
  }
  if (maxK === 0) return null;
  return (maxK * sampleHz) / N;
}

export function useVibratoDetection(pitch: PitchReading): VibratoReading {
  const [reading, setReading] = useState<VibratoReading>(NONE);
  const noteHistoryRef = useRef<number[]>([]); // sequence of note-pitch in cents-from-A4
  const lastTickRef = useRef(0);

  useEffect(() => {
    if (pitch.hz === null) {
      noteHistoryRef.current = [];
      setReading(NONE);
      return;
    }
    const now = Date.now();
    if (now - lastTickRef.current < 90) return;
    lastTickRef.current = now;

    const cents = 1200 * Math.log2(pitch.hz / 440);
    noteHistoryRef.current.push(cents);
    if (noteHistoryRef.current.length > WINDOW_SAMPLES) {
      noteHistoryRef.current.shift();
    }
    if (noteHistoryRef.current.length < WINDOW_SAMPLES) {
      return;
    }

    const values = noteHistoryRef.current;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const centered = values.map((v) => v - mean);
    const peak = Math.max(...centered.map((v) => Math.abs(v)));
    if (peak < 12) {
      setReading(NONE);
      return;
    }
    const dom = dominantFrequency(centered, 10); // 10Hz sample rate (90ms)
    if (!dom || dom < 3 || dom > 9) {
      setReading(NONE);
      return;
    }
    const intensity: VibratoReading['intensity'] =
      peak < 25 ? 'subtle' : peak < 60 ? 'expressive' : 'wide';
    setReading({ rateHz: dom, depthCents: peak, active: true, intensity });
  }, [pitch.hz]);

  return reading;
}
