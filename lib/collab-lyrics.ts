import type { Song } from "./types";

export type CollabLyricsItem = {
  externalTrackId: string;
  title: string;
  lyrics: string;
  updatedAt?: string;
  bpm?: number;
};

export type LyricsSyncConfig = {
  source?: string;
  projectId?: string;
  apiKey?: string;
};

type RuntimeOverride = {
  present: boolean;
  value?: string;
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

function normalizeOptional(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function getRuntimeOverride(
  key: "__E2E_LYRICS_SYNC_SOURCE__" | "__E2E_LYRICS_SYNC_PROJECT_ID__"
): RuntimeOverride {
  const runtime = globalThis as Record<string, unknown>;
  if (!(key in runtime)) {
    return { present: false };
  }
  return {
    present: true,
    value: normalizeOptional(runtime[key]),
  };
}

export function resolveLyricsSyncConfig(config?: LyricsSyncConfig): LyricsSyncConfig {
  const runtimeSource = getRuntimeOverride("__E2E_LYRICS_SYNC_SOURCE__");
  const runtimeProjectId = getRuntimeOverride("__E2E_LYRICS_SYNC_PROJECT_ID__");

  const envSource = normalizeOptional(process.env.EXPO_PUBLIC_LYRICS_SYNC_SOURCE);
  const envProjectId = normalizeOptional(process.env.EXPO_PUBLIC_LYRICS_SYNC_PROJECT_ID);
  const envApiKey = normalizeOptional(process.env.EXPO_PUBLIC_API_KEY);

  const baseSource = runtimeSource.present ? runtimeSource.value : envSource;
  const baseProjectId = runtimeProjectId.present
    ? runtimeProjectId.value
    : envProjectId;

  const explicitSource =
    config && "source" in config ? normalizeOptional(config.source) : undefined;
  const explicitProjectId =
    config && "projectId" in config
      ? normalizeOptional(config.projectId)
      : undefined;
  const explicitApiKey =
    config && "apiKey" in config ? normalizeOptional(config.apiKey) : undefined;

  return {
    source: explicitSource ?? baseSource,
    projectId: explicitProjectId ?? baseProjectId,
    apiKey: explicitApiKey ?? envApiKey,
  };
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

export function buildLyricsSyncRoute(config?: LyricsSyncConfig): string {
  const resolved = resolveLyricsSyncConfig(config);
  const params = new URLSearchParams();

  if (resolved.source) {
    params.set("source", resolved.source);
  }
  if (resolved.projectId) {
    params.set("projectId", resolved.projectId);
  }

  const query = params.toString();
  return query ? `/api/v1/collab/lyrics?${query}` : "/api/v1/collab/lyrics";
}

export function buildLyricsRealtimeSocketUrl(
  apiBaseUrl: string,
  config?: LyricsSyncConfig
): string | null {
  try {
    const url = new URL("/api/v1/ws", apiBaseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

    const resolved = resolveLyricsSyncConfig(config);
    if (resolved.source) {
      url.searchParams.set("source", resolved.source);
    }
    if (resolved.projectId) {
      url.searchParams.set("projectId", resolved.projectId);
    }
    if (resolved.apiKey) {
      url.searchParams.set("apiKey", resolved.apiKey);
    }

    return url.toString();
  } catch {
    return null;
  }
}
