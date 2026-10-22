import { validBpm } from './tempo';
export type MetronomeHandle = { stop: () => void };
export type MetronomeStart = (options: {
  id: string; bpm: number; beats: number; signal: AbortSignal;
  onStopped: (message: string) => void;
}) => Promise<MetronomeHandle>;
export type MetronomeState = { status: 'idle' | 'loading' | 'playing' | 'error'; bpm: number | null; error?: string };
let serial = 0;

export function createMetronomeController(startAudio: MetronomeStart, update: (state: MetronomeState) => void, timeoutMs = 10000) {
  let active: { id: string; bpm: number; beats: number; abort: AbortController; promise: Promise<void>; handle?: MetronomeHandle } | null = null;
  function stop() {
    const old = active;
    active = null;
    old?.abort.abort();
    old?.handle?.stop();
    update({ status: 'idle', bpm: null });
  }
  function start(bpm: number, beats = 4): Promise<void> {
    if (validBpm(bpm) === null || !Number.isInteger(beats) || beats < 1 || beats > 12) {
      stop();
      const error = new Error('The producer has not set a valid BPM.');
      update({ status: 'error', bpm: null, error: error.message });
      return Promise.reject(error);
    }
    if (active?.bpm === bpm && active.beats === beats) return active.promise;
    stop();
    const current = { id: `metronome-${++serial}`, bpm, beats, abort: new AbortController(), promise: Promise.resolve() } as NonNullable<typeof active>;
    active = current;
    update({ status: 'loading', bpm });
    let timer: ReturnType<typeof setTimeout>;
    let rejectFailure: (error: Error) => void;
    const failure = new Promise<never>((_, reject) => { rejectFailure = reject; });
    const audio = Promise.resolve().then(() => {
      if (current.abort.signal.aborted) return;
      return startAudio({ id: current.id, bpm, beats, signal: current.abort.signal,
        onStopped: message => {
          if (active !== current) return;
          if (!current.handle) { rejectFailure(new Error(message)); return; }
          active = null;
          current.abort.abort();
          current.handle.stop();
          update({status: 'error', bpm, error: message});
        },
      });
    }).then(handle => {
      if (!handle) return;
      if (active !== current || current.abort.signal.aborted) { handle.stop(); return; }
      current.handle = handle;
      update({ status: 'playing', bpm });
    });
    const cancelled = new Promise<void>(resolve => current.abort.signal.addEventListener('abort', () => resolve(), { once: true }));
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Metronome audio could not start. Check the audio output and retry.')), timeoutMs);
    });
    current.promise = Promise.race([audio, failure, cancelled, timeout]).catch(error => {
      if (active !== current) return;
      active = null;
      current.abort.abort();
      current.handle?.stop();
      update({ status: 'error', bpm, error: error instanceof Error ? error.message : 'Metronome audio is unavailable.' });
      throw error;
    }).finally(() => clearTimeout(timer));
    return current.promise;
  }
  return { start, stop };
}
