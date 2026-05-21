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

// 16-bit PCM WAV encoder. Mono / stereo only — Pro Tools handles both.
export function bufferToWavBlob(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const samples = buffer.length;
  const bytesPerSample = 2;
  const dataLength = samples * channels * bytesPerSample;
  const totalLength = 44 + dataLength;
  const ab = new ArrayBuffer(totalLength);
  const view = new DataView(ab);

  // RIFF / WAVE header
  let offset = 0;
  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    offset += s.length;
  };
  writeStr("RIFF");
  view.setUint32(offset, totalLength - 8, true); offset += 4;
  writeStr("WAVE");
  writeStr("fmt ");
  view.setUint32(offset, 16, true); offset += 4;            // chunk size
  view.setUint16(offset, 1, true); offset += 2;             // PCM
  view.setUint16(offset, channels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * channels * bytesPerSample, true); offset += 4;
  view.setUint16(offset, channels * bytesPerSample, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2;            // bits per sample
  writeStr("data");
  view.setUint32(offset, dataLength, true); offset += 4;

  // Interleave channels and convert float [-1..1] -> int16
  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) channelData.push(buffer.getChannelData(c));
  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = Math.max(-1, Math.min(1, channelData[c][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([ab], { type: "audio/wav" });
}

export function downloadWavBlob(blob: Blob, filename: string): void {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
