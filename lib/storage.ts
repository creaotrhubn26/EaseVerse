import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Song, Session, UserSettings } from './types';

const SONGS_KEY = '@lyricflow_songs';
const SESSIONS_KEY = '@lyricflow_sessions';
const SETTINGS_KEY = '@lyricflow_settings';
const LYRICS_SNAPSHOTS_KEY = '@easeverse_lyrics_snapshots';

export type LyricsSnapshotRecord = {
  lyrics: string;
  bpm?: number;
  syncedAt: number;
  remoteUpdatedAt?: string;
  sourceTrackId?: string;
};

export type LyricsSnapshotMap = Record<string, LyricsSnapshotRecord>;

const defaultSettings: UserSettings = {
  language: 'English',
  accentGoal: 'US',
  feedbackIntensity: 'medium',
  liveMode: 'stability',
  lyricsFollowSpeed: 'normal',
  countIn: 0,
  narrationVoice: 'female',
  metronomeEnabled: false,
};

function safeParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function getSongs(): Promise<Song[]> {
  const data = await AsyncStorage.getItem(SONGS_KEY);
  if (!data) {
    return [];
  }
  const parsed = safeParseJson(data);
  if (!Array.isArray(parsed)) {
    await AsyncStorage.removeItem(SONGS_KEY);
    return [];
  }
  return parsed as Song[];
}

export async function saveSong(song: Song): Promise<void> {
  const songs = await getSongs();
  const idx = songs.findIndex(s => s.id === song.id);
  if (idx >= 0) {
    songs[idx] = song;
  } else {
    songs.unshift(song);
  }
  await AsyncStorage.setItem(SONGS_KEY, JSON.stringify(songs));
}

export async function deleteSong(id: string): Promise<void> {
  const songs = await getSongs();
  await AsyncStorage.setItem(SONGS_KEY, JSON.stringify(songs.filter(s => s.id !== id)));
}

export async function getSessions(): Promise<Session[]> {
  const data = await AsyncStorage.getItem(SESSIONS_KEY);
  if (!data) {
    return [];
  }
  const parsed = safeParseJson(data);
  if (!Array.isArray(parsed)) {
    await AsyncStorage.removeItem(SESSIONS_KEY);
    return [];
  }
  return parsed as Session[];
}

export async function saveSession(session: Session): Promise<void> {
  const sessions = await getSessions();
  const idx = sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) {
    sessions[idx] = session;
  } else {
    sessions.unshift(session);
  }
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export async function deleteSession(id: string): Promise<void> {
  const sessions = await getSessions();
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.filter(s => s.id !== id)));
}

export async function getSettings(): Promise<UserSettings> {
  const data = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!data) {
    return defaultSettings;
  }
  const parsed = safeParseJson(data);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    await AsyncStorage.removeItem(SETTINGS_KEY);
    return defaultSettings;
  }
  return { ...defaultSettings, ...(parsed as Partial<UserSettings>) };
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function getLyricsSnapshots(): Promise<LyricsSnapshotMap> {
  const data = await AsyncStorage.getItem(LYRICS_SNAPSHOTS_KEY);
  if (!data) {
    return {};
  }

  const parsed = safeParseJson(data);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    await AsyncStorage.removeItem(LYRICS_SNAPSHOTS_KEY);
    return {};
  }

  const snapshots = parsed as Record<string, unknown>;
  const normalized: LyricsSnapshotMap = {};

  for (const [songId, snapshot] of Object.entries(snapshots)) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      continue;
    }

    const candidate = snapshot as Record<string, unknown>;
    if (typeof candidate.lyrics !== 'string') {
      continue;
    }

    normalized[songId] = {
      lyrics: candidate.lyrics,
      syncedAt:
        typeof candidate.syncedAt === 'number' && Number.isFinite(candidate.syncedAt)
          ? candidate.syncedAt
          : Date.now(),
      remoteUpdatedAt:
        typeof candidate.remoteUpdatedAt === 'string' ? candidate.remoteUpdatedAt : undefined,
      sourceTrackId:
        typeof candidate.sourceTrackId === 'string' ? candidate.sourceTrackId : undefined,
    };
  }

  return normalized;
}

export async function saveLyricsSnapshots(
  snapshots: LyricsSnapshotMap
): Promise<void> {
  await AsyncStorage.setItem(LYRICS_SNAPSHOTS_KEY, JSON.stringify(snapshots));
}

export function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}
