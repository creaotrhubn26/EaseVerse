/** Producer values are authoritative; absence must never invent a default BPM. */
export function validBpm(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 20 && value <= 400 ? value : null;
}
export type StudioTempo = {bpm: number | null; source: 'sound-room' | 'lyrics'; unavailable?: boolean; updatedAt?: string};
export function studioBpm(tempo: StudioTempo | undefined, lyricsBpm?: unknown): number | null {
  if (tempo) return tempo.unavailable ? null : validBpm(tempo.bpm);
  return validBpm(lyricsBpm);
}
