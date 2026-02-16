import type { Song } from "./types";

export type CollabLyricsItem = {
  externalTrackId: string;
  title: string;
  lyrics: string;
  updatedAt?: string;
  bpm?: number;
};

export function normalizeTitle(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function parseIsoTimestampMs(value?: string): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseOptionalBpm(input: unknown): number | undefined {
  if (typeof input === "number" && Number.isFinite(input)) {
    return Math.max(30, Math.min(300, Math.round(input)));
  }
  if (typeof input === "string" && input.trim()) {
    const parsed = Number.parseInt(input.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(30, Math.min(300, parsed));
    }
  }
  return undefined;
}

export function parseCollabItem(input: unknown): CollabLyricsItem | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const raw = input as Record<string, unknown>;
  if (
    typeof raw.externalTrackId !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.lyrics !== "string"
  ) {
    return null;
  }

  return {
    externalTrackId: raw.externalTrackId,
    title: raw.title,
    lyrics: raw.lyrics,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    bpm: parseOptionalBpm(raw.bpm),
  };
}

export function dedupeCollabItems(items: CollabLyricsItem[]): CollabLyricsItem[] {
  const byTrackId = new Map<string, CollabLyricsItem>();
  for (const item of items) {
    const current = byTrackId.get(item.externalTrackId);
    if (!current) {
      byTrackId.set(item.externalTrackId, item);
      continue;
    }

    const currentTime = parseIsoTimestampMs(current.updatedAt);
    const incomingTime = parseIsoTimestampMs(item.updatedAt);
    if (incomingTime >= currentTime) {
      byTrackId.set(item.externalTrackId, item);
    }
  }

  return Array.from(byTrackId.values());
}

export function buildSongTitleCandidatesMap(songs: Song[]): Map<string, Song[]> {
  const candidates = new Map<string, Song[]>();
  for (const song of songs) {
    const key = normalizeTitle(song.title);
    if (!key) {
      continue;
    }
    const existing = candidates.get(key) ?? [];
    existing.push(song);
    candidates.set(key, existing);
  }
  return candidates;
}

export function buildLyricsSyncRoute(): string {
  const params = new URLSearchParams();
  const source = process.env.EXPO_PUBLIC_LYRICS_SYNC_SOURCE?.trim();
  const projectId = process.env.EXPO_PUBLIC_LYRICS_SYNC_PROJECT_ID?.trim();

  if (source) {
    params.set("source", source);
  }
  if (projectId) {
    params.set("projectId", projectId);
  }

  const query = params.toString();
  return query ? `/api/v1/collab/lyrics?${query}` : "/api/v1/collab/lyrics";
}

export function buildLyricsRealtimeSocketUrl(apiBaseUrl: string): string | null {
  try {
    const url = new URL("/api/v1/ws", apiBaseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

    const source = process.env.EXPO_PUBLIC_LYRICS_SYNC_SOURCE?.trim();
    const projectId = process.env.EXPO_PUBLIC_LYRICS_SYNC_PROJECT_ID?.trim();
    const apiKey = process.env.EXPO_PUBLIC_API_KEY?.trim();

    if (source) {
      url.searchParams.set("source", source);
    }
    if (projectId) {
      url.searchParams.set("projectId", projectId);
    }
    if (apiKey) {
      url.searchParams.set("apiKey", apiKey);
    }

    return url.toString();
  } catch {
    return null;
  }
}
