// Push native audioLevel (0..1 from expo-audio) to /api/sessions/level
// every ~500ms so other session members see the meter and waveform.

import { authedFetch } from "./authed-fetch";

export type NativeMeterHandle = {
  stop: () => void;
};

export function startNativeMeterPusher(args: {
  sessionId: string;
  getToken: () => Promise<string | null>;
  getLevel01: () => number; // 0..1
  postEveryMs?: number;
}): NativeMeterHandle {
  const postEveryMs = args.postEveryMs ?? 500;
  let peakDb = -90;
  const peaks: number[] = [];

  const sampleTimer = setInterval(() => {
    const v = Math.max(0, Math.min(1, args.getLevel01()));
    const levelDb = v <= 0 ? -90 : 20 * Math.log10(v);
    peakDb = Math.max(peakDb - 0.5, levelDb);
    peaks.push(Number(levelDb.toFixed(1)));
    if (peaks.length > 200) peaks.shift();
  }, 100);

  const postTimer = setInterval(() => {
    void (async () => {
      try {
        const token = await args.getToken();
        const v = Math.max(0, Math.min(1, args.getLevel01()));
        const levelDb = v <= 0 ? -90 : 20 * Math.log10(v);
        await authedFetch(`/api/sessions/level?id=${encodeURIComponent(args.sessionId)}`, token, {
          method: "POST",
          body: JSON.stringify({
            levelDb: Number(levelDb.toFixed(1)),
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
      clearInterval(sampleTimer);
      clearInterval(postTimer);
    },
  };
}
