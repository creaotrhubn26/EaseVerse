// Web-only: stitch comp segments into a single playable AudioBuffer and
// drive a single AudioBufferSourceNode. No server / ffmpeg needed.

export type StitchSegment = {
  takeId: string;
  audioUrl: string;
  startSec: number;
  endSec: number;
};

const bufferCache = new Map<string, AudioBuffer>();

async function loadAudioBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  const decoded = await ctx.decodeAudioData(arrayBuffer);
  bufferCache.set(url, decoded);
  return decoded;
}

export async function buildCompBuffer(segments: StitchSegment[]): Promise<AudioBuffer | null> {
  if (typeof window === "undefined" || segments.length === 0) return null;
  const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  try {
    const sources = await Promise.all(
      Array.from(new Set(segments.map((s) => s.audioUrl))).map(async (url) => {
        return [url, await loadAudioBuffer(ctx, url)] as const;
      }),
    );
    const buffersByUrl = new Map(sources);
    const sampleRate = sources[0]?.[1].sampleRate ?? 48000;
    const channels = Math.min(
      2,
      sources.reduce((max, [, b]) => Math.max(max, b.numberOfChannels), 1),
    );
    let totalLength = 0;
    const ranges = segments.map((s) => {
      const buf = buffersByUrl.get(s.audioUrl);
      if (!buf) return { offset: 0, length: 0, buffer: null };
      const start = Math.max(0, Math.floor(s.startSec * buf.sampleRate));
      const end = Math.min(buf.length, Math.floor(s.endSec * buf.sampleRate));
      const length = Math.max(0, end - start);
      const offset = totalLength;
      totalLength += length;
      return { offset, length, buffer: buf, start };
    });
    if (totalLength === 0) return null;
    const output = ctx.createBuffer(channels, totalLength, sampleRate);
    for (let c = 0; c < channels; c++) {
      const dest = output.getChannelData(c);
      for (let i = 0; i < ranges.length; i++) {
        const r = ranges[i];
        if (!r.buffer || r.length === 0) continue;
        const src = r.buffer.getChannelData(Math.min(c, r.buffer.numberOfChannels - 1));
        for (let s = 0; s < r.length; s++) dest[r.offset + s] = src[(r.start ?? 0) + s];
      }
    }
    return output;
  } finally {
    void ctx.close();
  }
}

export function playBuffer(buffer: AudioBuffer): { stop: () => void; node: AudioBufferSourceNode; ctx: AudioContext } {
  const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
  return {
    stop() {
      try {
        source.stop();
      } catch {
        // already stopped
      }
      void ctx.close();
    },
    node: source,
    ctx,
  };
}

export function bufferDurationSec(buffer: AudioBuffer): number {
  return buffer.length / buffer.sampleRate;
}
