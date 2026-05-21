// Sample-accurate Web Audio metronome. Schedules a short tone burst per
// beat using AudioContext.currentTime so it never drifts even if the
// JS event loop is busy. Accented downbeat (higher pitch) every N beats.

export type ClickHandle = {
  stop: () => void;
  isRunning: () => boolean;
};

export type ClickOptions = {
  bpm: number;
  beatsPerBar?: number;
  accentDownbeat?: boolean;
  volume?: number;
};

export function startClick(opts: ClickOptions): ClickHandle {
  if (typeof window === "undefined") {
    return { stop: () => undefined, isRunning: () => false };
  }
  const ctx = new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const beatsPerBar = Math.max(1, Math.min(12, opts.beatsPerBar ?? 4));
  const interval = 60 / Math.max(20, Math.min(300, opts.bpm));
  const lookahead = 0.1; // seconds to schedule ahead of currentTime
  const scheduleAheadTime = 0.25;
  let nextTime = ctx.currentTime + 0.1;
  let beat = 0;
  let running = true;

  function scheduleNote(time: number, accent: boolean) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(accent ? 1500 : 900, time);
    osc.type = "square";
    const peak = Math.max(0, Math.min(1, opts.volume ?? 0.5)) * (accent ? 0.4 : 0.25);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.07);
  }

  function scheduler() {
    if (!running) return;
    while (nextTime < ctx.currentTime + scheduleAheadTime) {
      const isDownbeat = beat % beatsPerBar === 0;
      scheduleNote(nextTime, opts.accentDownbeat !== false && isDownbeat);
      nextTime += interval;
      beat += 1;
    }
    timer = setTimeout(scheduler, lookahead * 1000);
  }

  let timer: ReturnType<typeof setTimeout> = setTimeout(scheduler, 0);

  return {
    stop() {
      running = false;
      clearTimeout(timer);
      void ctx.close();
    },
    isRunning() {
      return running;
    },
  };
}
