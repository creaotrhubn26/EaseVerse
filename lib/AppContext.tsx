import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback } from 'react';
import type { Song, Session, UserSettings } from './types';
import * as Storage from './storage';
import { demoSong, demoSessions } from './demo-data';

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
    countIn: 0,
  });
  const [activeSong, setActiveSong] = useState<Song | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        let loadedSongs = await Storage.getSongs();
        let loadedSessions = await Storage.getSessions();
        const loadedSettings = await Storage.getSettings();

        if (loadedSongs.length === 0) {
          loadedSongs = [demoSong];
          await Storage.saveSong(demoSong);
        }
        if (loadedSessions.length === 0) {
          loadedSessions = demoSessions;
          for (const s of demoSessions) {
            await Storage.saveSession(s);
          }
        }

        setSongs(loadedSongs);
        setSessions(loadedSessions);
        setSettings(loadedSettings);
        setActiveSong(loadedSongs[0] || null);
      } catch (e) {
        console.error('Failed to load data', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const addSong = useCallback(async (song: Song) => {
    setSongs(prev => [song, ...prev]);
    await Storage.saveSong(song);
  }, []);

  const updateSong = useCallback(async (song: Song) => {
    setSongs(prev => prev.map(s => s.id === song.id ? song : s));
    await Storage.saveSong(song);
  }, []);

  const removeSong = useCallback(async (id: string) => {
    setSongs(prev => prev.filter(s => s.id !== id));
    await Storage.deleteSong(id);
  }, []);

  const addSession = useCallback(async (session: Session) => {
    setSessions(prev => [session, ...prev]);
    await Storage.saveSession(session);
  }, []);

  const toggleFavorite = useCallback(async (id: string) => {
    setSessions(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, favorite: !s.favorite } : s);
      const session = updated.find(s => s.id === id);
      if (session) Storage.saveSession(session);
      return updated;
    });
  }, []);

  const removeSession = useCallback(async (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    await Storage.deleteSession(id);
  }, []);

  const updateSettingsCb = useCallback(async (partial: Partial<UserSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...partial };
      Storage.saveSettings(updated);
      return updated;
    });
  }, []);

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
    toggleFavorite,
    removeSession,
    updateSettings: updateSettingsCb,
    isLoading,
  }), [songs, sessions, settings, activeSong, isLoading, addSong, updateSong, removeSong, addSession, toggleFavorite, removeSession, updateSettingsCb]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
