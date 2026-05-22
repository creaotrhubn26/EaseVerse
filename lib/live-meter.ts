// Tap a MediaStream's mic input → measure RMS + peak → push aggregated
// levels to the server every ~500ms so other session participants can
// see your meter and a rolling waveform in real time.

import { authedFetch } from "./authed-fetch";

export type MeterHandle = {
  stop: () => void;
  isRunning: () => boolean;
};

export function startLiveMeter(args: {
  stream: MediaStream;
  sessionId: string;
  getToken: () => Promise<string | null>;
  sampleHz?: number;
  postEveryMs?: number;
}): MeterHandle {
  if (typeof window === "undefined") {
    return { stop: () => undefined, isRunning: () => false };
  }
  const sampleHz = args.sampleHz ?? 30; // local samples per second
  const postEveryMs = args.postEveryMs ?? 500;
  const ctx = new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const source = ctx.createMediaStreamSource(args.stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);

  let running = true;
  let lastSampledDb = -60;
  let peakDb = -90;
  const peaks: number[] = [];

  const sampleTimer = setInterval(() => {
    analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    let max = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sumSquares += v * v;
      const absV = Math.abs(v);
      if (absV > max) max = absV;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    const rmsDb = 20 * Math.log10(Math.max(rms, 0.0001));
    const peakInstant = 20 * Math.log10(Math.max(max, 0.0001));
    lastSampledDb = rmsDb;
    peakDb = Math.max(peakDb - 0.5, peakInstant); // gentle decay
    peaks.push(Number(rmsDb.toFixed(1)));
    if (peaks.length > 200) peaks.shift();
  }, Math.max(20, 1000 / sampleHz));

  const postTimer = setInterval(() => {
    void (async () => {
      try {
        const token = await args.getToken();
        await authedFetch(`/api/sessions/level?id=${encodeURIComponent(args.sessionId)}`, token, {
          method: "POST",
          body: JSON.stringify({
            levelDb: Number(lastSampledDb.toFixed(1)),
            peakDb: Number(peakDb.toFixed(1)),
            waveformPeaks: peaks.slice(-40),
          }),
        });
      } catch {
        /* ignore */
      }
    })();
  }, postEveryMs);

  return {
    stop() {
      running = false;
      clearInterval(sampleTimer);
      clearInterval(postTimer);
      try {
        source.disconnect();
        analyser.disconnect();
      } catch {
        /* ignore */
      }
      void ctx.close();
    },
    isRunning: () => running,
  };
}
