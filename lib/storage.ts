import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Song, Session, UserSettings } from './types';

const SONGS_KEY = '@lyricflow_songs';
const SESSIONS_KEY = '@lyricflow_sessions';
const SETTINGS_KEY = '@lyricflow_settings';
const LYRICS_SNAPSHOTS_KEY = '@easeverse_lyrics_snapshots';
const LYRICS_VERSIONS_KEY = '@easeverse_lyrics_versions';
const LYRICS_LINE_COMMENTS_KEY = '@easeverse_lyrics_line_comments';
const LYRICS_CAPTURE_INBOX_KEY = '@easeverse_lyrics_capture_inbox';
const EASEPOCKET_PREFS_KEY = '@easeverse_easepocket_prefs';
const EASEPOCKET_HISTORY_KEY = '@easeverse_easepocket_history';
const LEARNING_USER_ID_KEY = '@easeverse_learning_user_id';

export type EasePocketMode = 'subdivision' | 'silent' | 'consonant' | 'pocket' | 'slow';
export type EasePocketGrid = 'beat' | '8th' | '16th';

export type EasePocketPrefs = {
  grid: EasePocketGrid;
  beatsPerBar: 2 | 4;
  lastBpmOverride?: number;
};

export type EasePocketHistoryItem = {
  id: string;
  mode: EasePocketMode;
  createdAt: number;
  bpm: number;
  grid: EasePocketGrid;
  beatsPerBar: 2 | 4;
  label: string;
  stats: {
    eventCount: number;
    onTimePct: number;
    meanAbsMs: number;
    stdDevMs: number;
    avgOffsetMs: number;
  };
};

export type LyricsSnapshotRecord = {
  lyrics: string;
  bpm?: number;
  syncedAt: number;
  remoteUpdatedAt?: string;
  sourceTrackId?: string;
};

export type LyricsSnapshotMap = Record<string, LyricsSnapshotRecord>;

export type LyricsVersionRecord = {
  id: string;
  songId: string;
  title: string;
  lyrics: string;
  bpm?: number;
  createdAt: number;
  note?: string;
};

export type LyricsVersionMap = Record<string, LyricsVersionRecord[]>;

export type LyricsLineComment = {
  id: string;
  lineNumber: number;
  text: string;
  createdAt: number;
  updatedAt?: number;
};

export type LyricsLineCommentMap = Record<string, LyricsLineComment[]>;

export type LyricsCaptureItem = {
  id: string;
  text: string;
  createdAt: number;
  pinned?: boolean;
};

export type LyricsCaptureInboxMap = Record<string, LyricsCaptureItem[]>;

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

export async function saveSessions(sessions: Session[]): Promise<void> {
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

export async function getLyricsVersionsMap(): Promise<LyricsVersionMap> {
  const data = await AsyncStorage.getItem(LYRICS_VERSIONS_KEY);
  if (!data) {
    return {};
  }

  const parsed = safeParseJson(data);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    await AsyncStorage.removeItem(LYRICS_VERSIONS_KEY);
    return {};
  }

  const normalized: LyricsVersionMap = {};
  for (const [songId, versions] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(versions)) {
      continue;
    }
    const valid = versions
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      .filter((item) => typeof item.id === 'string' && typeof item.lyrics === 'string' && typeof item.title === 'string')
      .map((item) => ({
        id: item.id as string,
        songId: typeof item.songId === 'string' ? item.songId : songId,
        title: item.title as string,
        lyrics: item.lyrics as string,
        bpm: typeof item.bpm === 'number' && Number.isFinite(item.bpm) ? item.bpm : undefined,
        createdAt:
          typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
            ? item.createdAt
            : Date.now(),
        note: typeof item.note === 'string' ? item.note : undefined,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
    if (valid.length > 0) {
      normalized[songId] = valid;
    }
  }
  return normalized;
}

export async function getLyricsVersions(songId: string): Promise<LyricsVersionRecord[]> {
  const map = await getLyricsVersionsMap();
  return map[songId] ?? [];
}

export async function saveLyricsVersionsMap(map: LyricsVersionMap): Promise<void> {
  await AsyncStorage.setItem(LYRICS_VERSIONS_KEY, JSON.stringify(map));
}

export async function saveLyricsVersions(songId: string, versions: LyricsVersionRecord[]): Promise<void> {
  const map = await getLyricsVersionsMap();
  map[songId] = [...versions].sort((a, b) => b.createdAt - a.createdAt);
  await saveLyricsVersionsMap(map);
}

export async function addLyricsVersion(
  songId: string,
  version: LyricsVersionRecord,
  maxItems = 40
): Promise<void> {
  const versions = await getLyricsVersions(songId);
  const next = [version, ...versions.filter((existing) => existing.id !== version.id)].slice(0, maxItems);
  await saveLyricsVersions(songId, next);
}

export async function deleteLyricsVersion(songId: string, versionId: string): Promise<void> {
  const versions = await getLyricsVersions(songId);
  await saveLyricsVersions(
    songId,
    versions.filter((version) => version.id !== versionId)
  );
}

export async function getLyricsLineCommentMap(): Promise<LyricsLineCommentMap> {
  const data = await AsyncStorage.getItem(LYRICS_LINE_COMMENTS_KEY);
  if (!data) {
    return {};
  }

  const parsed = safeParseJson(data);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    await AsyncStorage.removeItem(LYRICS_LINE_COMMENTS_KEY);
    return {};
  }

  const normalized: LyricsLineCommentMap = {};
  for (const [songId, comments] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(comments)) {
      continue;
    }
    const valid = comments
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      .filter((item) => typeof item.id === 'string' && typeof item.text === 'string' && typeof item.lineNumber === 'number')
      .map((item) => ({
        id: item.id as string,
        lineNumber: Math.max(1, Math.round(item.lineNumber as number)),
        text: item.text as string,
        createdAt:
          typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
            ? item.createdAt
            : Date.now(),
        updatedAt:
          typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt)
            ? item.updatedAt
            : undefined,
      }))
      .sort((a, b) => a.lineNumber - b.lineNumber || b.createdAt - a.createdAt);
    if (valid.length > 0) {
      normalized[songId] = valid;
    }
  }

  return normalized;
}

export async function getLyricsLineComments(songId: string): Promise<LyricsLineComment[]> {
  const map = await getLyricsLineCommentMap();
  return map[songId] ?? [];
}

export async function saveLyricsLineComments(
  songId: string,
  comments: LyricsLineComment[]
): Promise<void> {
  const map = await getLyricsLineCommentMap();
  map[songId] = comments
    .filter((comment) => comment.text.trim().length > 0)
    .sort((a, b) => a.lineNumber - b.lineNumber || b.createdAt - a.createdAt);
  await AsyncStorage.setItem(LYRICS_LINE_COMMENTS_KEY, JSON.stringify(map));
}

export async function getLyricsCaptureInboxMap(): Promise<LyricsCaptureInboxMap> {
  const data = await AsyncStorage.getItem(LYRICS_CAPTURE_INBOX_KEY);
  if (!data) {
    return {};
  }

  const parsed = safeParseJson(data);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    await AsyncStorage.removeItem(LYRICS_CAPTURE_INBOX_KEY);
    return {};
  }

  const normalized: LyricsCaptureInboxMap = {};
  for (const [songId, captures] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(captures)) {
      continue;
    }
    const valid = captures
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      .filter((item) => typeof item.id === 'string' && typeof item.text === 'string')
      .map((item) => ({
        id: item.id as string,
        text: item.text as string,
        createdAt:
          typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
            ? item.createdAt
            : Date.now(),
        pinned: Boolean(item.pinned),
      }))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
    if (valid.length > 0) {
      normalized[songId] = valid;
    }
  }

  return normalized;
}

export async function getLyricsCaptureInbox(songId: string): Promise<LyricsCaptureItem[]> {
  const map = await getLyricsCaptureInboxMap();
  return map[songId] ?? [];
}

export async function saveLyricsCaptureInbox(
  songId: string,
  captures: LyricsCaptureItem[]
): Promise<void> {
  const map = await getLyricsCaptureInboxMap();
  map[songId] = captures
    .filter((capture) => capture.text.trim().length > 0)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
  await AsyncStorage.setItem(LYRICS_CAPTURE_INBOX_KEY, JSON.stringify(map));
}

const defaultEasePocketPrefs: EasePocketPrefs = {
  grid: '16th',
  beatsPerBar: 4,
};

export async function getEasePocketPrefs(): Promise<EasePocketPrefs> {
  const data = await AsyncStorage.getItem(EASEPOCKET_PREFS_KEY);
  if (!data) {
    return defaultEasePocketPrefs;
  }
  const parsed = safeParseJson(data);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    await AsyncStorage.removeItem(EASEPOCKET_PREFS_KEY);
    return defaultEasePocketPrefs;
  }
  return { ...defaultEasePocketPrefs, ...(parsed as Partial<EasePocketPrefs>) };
}

export async function saveEasePocketPrefs(prefs: EasePocketPrefs): Promise<void> {
  await AsyncStorage.setItem(EASEPOCKET_PREFS_KEY, JSON.stringify(prefs));
}

export async function getEasePocketHistory(): Promise<EasePocketHistoryItem[]> {
  const data = await AsyncStorage.getItem(EASEPOCKET_HISTORY_KEY);
  if (!data) {
    return [];
  }
  const parsed = safeParseJson(data);
  if (!Array.isArray(parsed)) {
    await AsyncStorage.removeItem(EASEPOCKET_HISTORY_KEY);
    return [];
  }
  return parsed as EasePocketHistoryItem[];
}

export async function addEasePocketHistoryItem(item: EasePocketHistoryItem): Promise<void> {
  const history = await getEasePocketHistory();
  history.unshift(item);
  // Keep history bounded so AsyncStorage doesn't grow indefinitely.
  const capped = history.slice(0, 80);
  await AsyncStorage.setItem(EASEPOCKET_HISTORY_KEY, JSON.stringify(capped));
}

export function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export async function getOrCreateLearningUserId(): Promise<string> {
  const existing = await AsyncStorage.getItem(LEARNING_USER_ID_KEY);
  if (existing && existing.trim().length > 0) {
    return existing.trim();
  }

  const next = `evu_${generateId()}`;
  await AsyncStorage.setItem(LEARNING_USER_ID_KEY, next);
  return next;
}
