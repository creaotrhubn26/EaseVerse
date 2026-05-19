import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export type PitchReading = {
  hz: number | null;
  note: string | null;
  cents: number;
  confidence: number;
};

const SILENT: PitchReading = { hz: null, note: null, cents: 0, confidence: 0 };
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function autoCorrelate(buf: Float32Array, sampleRate: number): { hz: number; confidence: number } | null {
  const SIZE = buf.length;
  let sumSquares = 0;
  for (let i = 0; i < SIZE; i++) {
    const v = buf[i];
    sumSquares += v * v;
  }
  const rms = Math.sqrt(sumSquares / SIZE);
  if (rms < 0.01) return null;

  // Trim leading/trailing silence below 20% of peak
  let r1 = 0;
  let r2 = SIZE - 1;
  const threshold = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) >= threshold) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - 1 - i]) >= threshold) {
      r2 = SIZE - 1 - i;
      break;
    }
  }
  const trimmed = buf.slice(r1, r2 + 1);
  const trimmedSize = trimmed.length;
  if (trimmedSize < 64) return null;

  const c = new Float32Array(trimmedSize);
  for (let lag = 0; lag < trimmedSize; lag++) {
    let acc = 0;
    for (let i = 0; i < trimmedSize - lag; i++) {
      acc += trimmed[i] * trimmed[i + lag];
    }
    c[lag] = acc;
  }

  // Find first descent
  let d = 0;
  while (d + 1 < trimmedSize && c[d + 1] < c[d]) d++;

  // Find max correlation after the descent
  let maxVal = -Infinity;
  let maxPos = -1;
  for (let i = d; i < trimmedSize; i++) {
    if (c[i] > maxVal) {
      maxVal = c[i];
      maxPos = i;
    }
  }
  if (maxPos < 1) return null;

  // Parabolic interpolation around maxPos
  const y1 = c[maxPos - 1] ?? maxVal;
  const y2 = c[maxPos];
  const y3 = c[maxPos + 1] ?? maxVal;
  const a = (y1 + y3 - 2 * y2) / 2;
  const b = (y3 - y1) / 2;
  const refined = a !== 0 ? maxPos - b / (2 * a) : maxPos;

  const hz = sampleRate / refined;
  if (hz < 60 || hz > 1500) return null;

  const confidence = Math.min(1, Math.max(0, maxVal / (c[0] || 1)));
  if (confidence < 0.5) return null;

  return { hz, confidence };
}

function hzToNote(hz: number): { note: string; cents: number } {
  const noteNumFloat = 12 * Math.log2(hz / 440) + 69;
  const noteNum = Math.round(noteNumFloat);
  const cents = Math.round((noteNumFloat - noteNum) * 100);
  const name = NOTE_NAMES[((noteNum % 12) + 12) % 12];
  const octave = Math.floor(noteNum / 12) - 1;
  return { note: `${name}${octave}`, cents };
}

export function usePitchDetection(enabled: boolean): PitchReading {
  const [reading, setReading] = useState<PitchReading>(SILENT);
  const animFrameRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Float32Array | null>(null);
  const lastTickRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;

    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const AudioCtor =
          (window as Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
            .AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtor) return;
        const ctx = new AudioCtor();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);

        streamRef.current = stream;
        ctxRef.current = ctx;
        analyserRef.current = analyser;
        bufferRef.current = new Float32Array(analyser.fftSize);

        const tick = (t: number) => {
          if (cancelled) return;
          animFrameRef.current = requestAnimationFrame(tick);
          if (t - lastTickRef.current < 80) return;
          lastTickRef.current = t;
          const analyserNode = analyserRef.current;
          const buf = bufferRef.current;
          if (!analyserNode || !buf) return;
          analyserNode.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
          const result = autoCorrelate(buf, ctx.sampleRate);
          if (!result) {
            setReading(SILENT);
            return;
          }
          const { note, cents } = hzToNote(result.hz);
          setReading({ hz: result.hz, note, cents, confidence: result.confidence });
        };
        animFrameRef.current = requestAnimationFrame(tick);
      } catch (error) {
        console.warn('Pitch detection failed:', error);
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      try {
        ctxRef.current?.close();
      } catch {
        // Ignore.
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      ctxRef.current = null;
      streamRef.current = null;
      analyserRef.current = null;
      bufferRef.current = null;
      setReading(SILENT);
    };
  }, [enabled]);

  return reading;
}
