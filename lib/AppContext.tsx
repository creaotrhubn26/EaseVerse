import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback, useRef } from 'react';
import type { Song, Session, UserSettings } from './types';
import * as Storage from './storage';

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
