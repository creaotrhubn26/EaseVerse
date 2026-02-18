import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback, useRef } from 'react';
import type { Song, Session, UserSettings } from './types';
import * as Storage from './storage';
import { runLearningBackfill } from './learning-backfill';
import { apiRequest, getApiUrl } from './query-client';
import { parseSongSections } from './lyrics-sections';
import {
  buildLyricsRealtimeSocketUrl,
  buildLyricsSyncRoute,
  buildSongTitleCandidatesMap,
  dedupeCollabItems,
  normalizeTitle,
  parseCollabItem,
} from './collab-lyrics';

interface AppContextValue {
  songs: Song[];
  sessions: Session[];
  settings: UserSettings;
  activeSong: Song | null;
  setSongs: (songs: Song[]) => void;
  setSessions: (sessions: Session[]) => void;
  setSettings: (settings: UserSettings) => void;
  setActiveSong: (song: Song | null) => void;
  addSong: (song: Song) => void;
  updateSong: (song: Song) => void;
  removeSong: (id: string) => void;
  addSession: (session: Session) => void;
  updateSession: (id: string, patch: Partial<Session>) => void;
  toggleFavorite: (id: string) => void;
  removeSession: (id: string) => void;
  updateSettings: (settings: Partial<UserSettings>) => void;
  isLoading: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

type CollabRealtimeMessage = {
  type?: string;
};

const AUTO_LYRICS_SYNC_THROTTLE_MS = 30_000;
const AUTO_LYRICS_SYNC_THROTTLE_KEY = 'easeverse:autoLyricsSyncLastRunAt';

function loadAutoLyricsSyncLastRunAt(): number {
  if (typeof window === 'undefined') {
    return 0;
  }

  try {
    const value = window.sessionStorage.getItem(AUTO_LYRICS_SYNC_THROTTLE_KEY);
    if (!value) {
      return 0;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function persistAutoLyricsSyncLastRunAt(timestampMs: number): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(AUTO_LYRICS_SYNC_THROTTLE_KEY, String(timestampMs));
  } catch {
    // Ignore storage persistence failures.
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [settings, setSettings] = useState<UserSettings>({
    language: 'English',
    accentGoal: 'US',
    feedbackIntensity: 'medium',
    liveMode: 'stability',
    lyricsFollowSpeed: 'normal',
    countIn: 0,
    narrationVoice: 'female',
    metronomeEnabled: false,
  });
  const [activeSong, setActiveSong] = useState<Song | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const sessionsHydratedRef = useRef(false);
  const songsRef = useRef<Song[]>([]);
  const autoLyricsSyncInFlightRef = useRef(false);
  const autoLyricsSyncQueuedRef = useRef(false);
  const autoLyricsSyncLastRunAtRef = useRef(0);
  const runAutoLyricsSyncRef = useRef<() => void>(() => undefined);
  const apiBaseUrl = useMemo(() => getApiUrl(), []);

  useEffect(() => {
    autoLyricsSyncLastRunAtRef.current = loadAutoLyricsSyncLastRunAt();
  }, []);

  const queuePersist = useCallback((task: () => Promise<void>) => {
    persistQueueRef.current = persistQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await task();
        } catch (error) {
          console.error('Failed to persist app data:', error);
        }
      });
    return persistQueueRef.current;
  }, []);

  useEffect(() => {
    songsRef.current = songs;
  }, [songs]);

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (!sessionsHydratedRef.current) {
      sessionsHydratedRef.current = true;
      return;
    }
    void queuePersist(() => Storage.saveSessions(sessions));
  }, [isLoading, queuePersist, sessions]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loadedSongs = await Storage.getSongs();
        const loadedSessions = await Storage.getSessions();
        const loadedSettings = await Storage.getSettings();

        if (cancelled) {
          return;
        }
        setSongs(loadedSongs);
        setSessions(loadedSessions);
        setSettings(loadedSettings);
        setActiveSong(loadedSongs[0] || null);
        void runLearningBackfill({ sessions: loadedSessions }).catch((error) => {
          console.error('Learning backfill failed:', error);
        });
      } catch (e) {
        console.error('Failed to load data', e);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const addSong = useCallback((song: Song) => {
    setSongs(prev => [song, ...prev]);
    void queuePersist(() => Storage.saveSong(song));
  }, [queuePersist]);

  const updateSong = useCallback((song: Song) => {
    setSongs(prev => prev.map(s => s.id === song.id ? song : s));
    setActiveSong(prev => (prev && prev.id === song.id ? song : prev));
    void queuePersist(() => Storage.saveSong(song));
  }, [queuePersist]);

  const removeSong = useCallback((id: string) => {
    setSongs(prev => prev.filter(s => s.id !== id));
    void queuePersist(() => Storage.deleteSong(id));
  }, [queuePersist]);

  const addSession = useCallback((session: Session) => {
    setSessions(prev => [session, ...prev]);
    void queuePersist(() => Storage.saveSession(session));
  }, [queuePersist]);

  const updateSession = useCallback((id: string, patch: Partial<Session>) => {
    let updatedSession: Session | undefined;
    setSessions(prev => prev.map(session => {
      if (session.id !== id) {
        return session;
      }
      updatedSession = { ...session, ...patch };
      return updatedSession;
    }));
    if (updatedSession) {
      void queuePersist(() => Storage.saveSession(updatedSession as Session));
    }
  }, [queuePersist]);

  const toggleFavorite = useCallback((id: string) => {
    let updatedSession: Session | undefined;
    setSessions(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, favorite: !s.favorite } : s);
      updatedSession = updated.find(s => s.id === id);
      return updated;
    });
    if (updatedSession) {
      void queuePersist(() => Storage.saveSession(updatedSession as Session));
    }
  }, [queuePersist]);

  const removeSession = useCallback((id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    void queuePersist(() => Storage.deleteSession(id));
  }, [queuePersist]);

  const updateSettingsCb = useCallback((partial: Partial<UserSettings>) => {
    let updatedSettings: UserSettings | undefined;
    setSettings(prev => {
      updatedSettings = { ...prev, ...partial };
      return updatedSettings;
    });
    if (updatedSettings) {
      void queuePersist(() => Storage.saveSettings(updatedSettings as UserSettings));
    }
  }, [queuePersist]);

  const syncCollaborativeLyricsInBackground = useCallback(async () => {
    const currentSongs = songsRef.current;
    if (currentSongs.length === 0) {
      return;
    }

    let response: Response;
    try {
      response = await apiRequest('GET', buildLyricsSyncRoute());
    } catch {
      return;
    }

    const payload = (await response.json()) as { items?: unknown[] };
    const remoteItems = Array.isArray(payload.items)
      ? dedupeCollabItems(
          payload.items
            .map(parseCollabItem)
            .filter((item): item is NonNullable<ReturnType<typeof parseCollabItem>> => Boolean(item))
        )
      : [];

    if (remoteItems.length === 0) {
      return;
    }

    const snapshots = await Storage.getLyricsSnapshots();
    const nextSnapshots: Storage.LyricsSnapshotMap = { ...snapshots };
    const songsById = new Map(currentSongs.map((song) => [song.id, song]));
    const songsByTitle = buildSongTitleCandidatesMap(currentSongs);
    const songIdBySourceTrackId = new Map<string, string>();
    const pendingSongUpdates = new Map<string, Song>();

    for (const [songId, snapshot] of Object.entries(nextSnapshots)) {
      if (snapshot.sourceTrackId) {
        songIdBySourceTrackId.set(snapshot.sourceTrackId, songId);
      }
    }

    for (const item of remoteItems) {
      const snapshotSongId = songIdBySourceTrackId.get(item.externalTrackId);
      let matchedSong =
        (snapshotSongId ? songsById.get(snapshotSongId) : undefined) ??
        songsById.get(item.externalTrackId);

      if (!matchedSong) {
        const titleCandidates = songsByTitle.get(normalizeTitle(item.title)) ?? [];
        if (titleCandidates.length === 1) {
          matchedSong = titleCandidates[0];
        }
      }

      if (!matchedSong) {
        continue;
      }

      const incomingLyrics = item.lyrics.replace(/\r\n/g, '\n');
      const incomingBpm =
        typeof item.bpm === 'number' && Number.isFinite(item.bpm)
          ? Math.max(30, Math.min(300, Math.round(item.bpm)))
          : undefined;

      const shouldUpdateLyrics = matchedSong.lyrics !== incomingLyrics;
      const shouldUpdateTempo =
        typeof incomingBpm === 'number' && incomingBpm !== matchedSong.bpm;

      if (shouldUpdateLyrics || shouldUpdateTempo) {
        pendingSongUpdates.set(matchedSong.id, {
          ...matchedSong,
          ...(shouldUpdateLyrics
            ? {
                lyrics: incomingLyrics,
                sections: parseSongSections(incomingLyrics),
              }
            : {}),
          ...(shouldUpdateTempo ? { bpm: incomingBpm } : {}),
          updatedAt: Date.now(),
        });
      }

      nextSnapshots[matchedSong.id] = {
        lyrics: incomingLyrics,
        bpm:
          typeof incomingBpm === 'number'
            ? incomingBpm
            : nextSnapshots[matchedSong.id]?.bpm ?? matchedSong.bpm,
        syncedAt: Date.now(),
        remoteUpdatedAt: item.updatedAt,
        sourceTrackId: item.externalTrackId,
      };
      songIdBySourceTrackId.set(item.externalTrackId, matchedSong.id);
    }

    if (pendingSongUpdates.size > 0) {
      for (const updatedSong of pendingSongUpdates.values()) {
        updateSong(updatedSong);
      }
    }

    await Storage.saveLyricsSnapshots(nextSnapshots);
  }, [updateSong]);

  const runAutoLyricsSync = useCallback(() => {
    const now = Date.now();
    if (now - autoLyricsSyncLastRunAtRef.current < AUTO_LYRICS_SYNC_THROTTLE_MS) {
      return;
    }

    if (autoLyricsSyncInFlightRef.current) {
      autoLyricsSyncQueuedRef.current = true;
      return;
    }

    autoLyricsSyncInFlightRef.current = true;
    autoLyricsSyncLastRunAtRef.current = now;
    persistAutoLyricsSyncLastRunAt(now);
    void (async () => {
      try {
        await syncCollaborativeLyricsInBackground();
      } catch (error) {
        console.error('Background lyrics sync failed:', error);
      } finally {
        autoLyricsSyncInFlightRef.current = false;
        if (autoLyricsSyncQueuedRef.current) {
          autoLyricsSyncQueuedRef.current = false;
          setTimeout(() => {
            runAutoLyricsSyncRef.current();
          }, 0);
        }
      }
    })();
  }, [syncCollaborativeLyricsInBackground]);

  useEffect(() => {
    runAutoLyricsSyncRef.current = runAutoLyricsSync;
  }, [runAutoLyricsSync]);

  useEffect(() => {
    if (isLoading || typeof WebSocket === 'undefined') {
      return;
    }

    runAutoLyricsSync();

    const wsUrl = buildLyricsRealtimeSocketUrl(apiBaseUrl);
    if (!wsUrl) {
      return;
    }

    let cancelled = false;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer) {
        return;
      }
      const delay = Math.min(30_000, Math.max(1_000, 1_000 * 2 ** reconnectAttempts));
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (cancelled) {
        return;
      }

      try {
        socket = new WebSocket(wsUrl);
      } catch {
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        reconnectAttempts = 0;
        runAutoLyricsSyncRef.current();
      };

      socket.onmessage = (event) => {
        if (typeof event.data !== 'string') {
          return;
        }

        let parsed: CollabRealtimeMessage | null = null;
        try {
          parsed = JSON.parse(event.data) as CollabRealtimeMessage;
        } catch {
          return;
        }

        if (parsed?.type === 'collab_lyrics_updated') {
          runAutoLyricsSyncRef.current();
        }
      };

      socket.onclose = () => {
        if (cancelled) {
          return;
        }
        scheduleReconnect();
      };

      socket.onerror = () => {
        // Reconnect is handled by onclose.
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (
        socket &&
        (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
      ) {
        socket.close();
      }
    };
  }, [apiBaseUrl, isLoading, runAutoLyricsSync]);

  const value = useMemo(() => ({
    songs,
    sessions,
    settings,
    activeSong,
    setSongs,
    setSessions,
    setSettings,
    setActiveSong,
    addSong,
    updateSong,
    removeSong,
    addSession,
    updateSession,
    toggleFavorite,
    removeSession,
    updateSettings: updateSettingsCb,
    isLoading,
  }), [songs, sessions, settings, activeSong, isLoading, addSong, updateSong, removeSong, addSession, updateSession, toggleFavorite, removeSession, updateSettingsCb]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
