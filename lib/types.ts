export type WordState = 'upcoming' | 'active' | 'confirmed' | 'unclear' | 'mismatch';

export interface LyricWord {
  id: string;
  text: string;
  state: WordState;
  hint?: string;
}

export interface LyricLine {
  id: string;
  words: LyricWord[];
}

export interface SongSection {
  id: string;
  type:
    | 'verse'
    | 'pre-chorus'
    | 'chorus'
    | 'bridge'
    | 'final-chorus'
    | 'intro'
    | 'outro';
  label: string;
  lines: string[];
}

export type GenreId = 'pop' | 'jazz' | 'rnb' | 'rock' | 'classical' | 'hiphop' | 'country' | 'soul';

export interface Song {
  id: string;
  title: string;
  lyrics: string;
  sections: SongSection[];
  genre: GenreId;
  bpm?: number;
  createdAt: number;
  updatedAt: number;
}

export interface SessionInsight {
  textAccuracy: number;
  pronunciationClarity: number;
  timingConsistency: 'low' | 'medium' | 'high';
  topToFix: { word: string; reason: string }[];
}

export interface Session {
  id: string;
  songId?: string;
  genre?: GenreId;
  title: string;
  duration: number;
  date: number;
  recordingUri?: string;
  tags: string[];
  favorite: boolean;
  insights: SessionInsight;
  lyrics: string;
  transcript?: string;
}

export type SignalQuality = 'good' | 'ok' | 'poor';
export type FeedbackIntensity = 'low' | 'medium' | 'high';
export type LiveMode = 'stability' | 'speed';
export type NarrationVoice = 'female' | 'male';
export type LyricsFollowSpeed = 'slow' | 'normal' | 'fast';

export interface UserSettings {
  language: string;
  accentGoal: string;
  feedbackIntensity: FeedbackIntensity;
  liveMode: LiveMode;
  lyricsFollowSpeed: LyricsFollowSpeed;
  countIn: 0 | 2 | 4;
  narrationVoice: NarrationVoice;
  metronomeEnabled: boolean;
}
