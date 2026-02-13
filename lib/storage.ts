import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Song, Session, UserSettings } from './types';

const SONGS_KEY = '@lyricflow_songs';
const SESSIONS_KEY = '@lyricflow_sessions';
const SETTINGS_KEY = '@lyricflow_settings';

const defaultSettings: UserSettings = {
  language: 'English',
  accentGoal: 'US',
  feedbackIntensity: 'medium',
  liveMode: 'stability',
  countIn: 0,
};

export async function getSongs(): Promise<Song[]> {
  const data = await AsyncStorage.getItem(SONGS_KEY);
  return data ? JSON.parse(data) : [];
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
  return data ? JSON.parse(data) : [];
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
  return data ? { ...defaultSettings, ...JSON.parse(data) } : defaultSettings;
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}
