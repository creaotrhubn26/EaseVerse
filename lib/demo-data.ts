import type { Song, Session, LyricLine, GenreId } from './types';
import { generateId } from './storage';
import { getWordTipForGenre } from '@/constants/genres';

export const demoSong: Song = {
  id: 'demo-1',
  title: 'Midnight Glow',
  genre: 'pop',
  lyrics: `Walking through the city lights tonight
Every shadow tells a story bright
I can feel the rhythm in my bones
Dancing on these cobblestones alone

The midnight glow is calling me
A melody that sets me free
I sing it loud I sing it clear
For everyone around to hear

Stars are painting lines across the sky
Whispered promises that never die
Hold my hand and follow me along
Every step becomes our favorite song`,
  sections: [
    { id: generateId(), type: 'verse', label: 'Verse 1', lines: ['Walking through the city lights tonight', 'Every shadow tells a story bright', 'I can feel the rhythm in my bones', 'Dancing on these cobblestones alone'] },
    { id: generateId(), type: 'chorus', label: 'Chorus', lines: ['The midnight glow is calling me', 'A melody that sets me free', 'I sing it loud I sing it clear', 'For everyone around to hear'] },
    { id: generateId(), type: 'verse', label: 'Verse 2', lines: ['Stars are painting lines across the sky', 'Whispered promises that never die', 'Hold my hand and follow me along', 'Every step becomes our favorite song'] },
  ],
  createdAt: Date.now() - 86400000 * 3,
  updatedAt: Date.now() - 86400000,
};

export const demoSessions: Session[] = [
  {
    id: 'sess-1',
    songId: 'demo-1',
    genre: 'pop',
    title: 'Midnight Glow - Take 3',
    duration: 187,
    date: Date.now() - 3600000,
    tags: ['take 3', 'practice'],
    favorite: true,
    insights: {
      textAccuracy: 92,
      pronunciationClarity: 85,
      timingConsistency: 'high',
      topToFix: [
        { word: 'cobblestones', reason: 'Final consonant cluster rushed' },
        { word: 'melody', reason: 'Stress shifted to 2nd syllable' },
        { word: 'promises', reason: 'Middle vowel too open' },
      ],
    },
    lyrics: demoSong.lyrics,
  },
  {
    id: 'sess-2',
    songId: 'demo-1',
    genre: 'pop',
    title: 'Midnight Glow - Take 2',
    duration: 195,
    date: Date.now() - 86400000,
    tags: ['take 2', 'demo'],
    favorite: false,
    insights: {
      textAccuracy: 78,
      pronunciationClarity: 72,
      timingConsistency: 'medium',
      topToFix: [
        { word: 'tonight', reason: 'Final T missing' },
        { word: 'rhythm', reason: 'TH sound unclear' },
        { word: 'cobblestones', reason: 'Syllable timing off' },
        { word: 'everyone', reason: 'Vowel reduction needed' },
      ],
    },
    lyrics: demoSong.lyrics,
  },
  {
    id: 'sess-3',
    songId: 'demo-1',
    genre: 'pop',
    title: 'Midnight Glow - Take 1',
    duration: 210,
    date: Date.now() - 86400000 * 2,
    tags: ['take 1', 'practice'],
    favorite: false,
    insights: {
      textAccuracy: 65,
      pronunciationClarity: 60,
      timingConsistency: 'low',
      topToFix: [
        { word: 'tonight', reason: 'Final T missing' },
        { word: 'shadow', reason: 'Open vowel needed' },
        { word: 'rhythm', reason: 'TH sound dropped' },
        { word: 'melody', reason: 'Stress on wrong syllable' },
        { word: 'promises', reason: 'Final S too soft' },
      ],
    },
    lyrics: demoSong.lyrics,
  },
];

export function buildDemoLyricLines(lyrics: string, activeLineIndex: number, activeWordIndex: number, genre?: GenreId): LyricLine[] {
  const lines = lyrics.split('\n').filter(l => l.trim());
  return lines.map((line, li) => {
    const words = line.split(' ').filter(w => w.trim());
    return {
      id: `line-${li}`,
      words: words.map((word, wi) => {
        let state: LyricLine['words'][0]['state'] = 'upcoming';
        if (li < activeLineIndex) {
          state = Math.random() > 0.15 ? 'confirmed' : (Math.random() > 0.5 ? 'unclear' : 'mismatch');
        } else if (li === activeLineIndex) {
          if (wi < activeWordIndex) {
            state = Math.random() > 0.1 ? 'confirmed' : 'unclear';
          } else if (wi === activeWordIndex) {
            state = 'active';
          }
        }
        let hint: string | undefined;
        if (state === 'mismatch' || state === 'unclear') {
          const genreTip = genre ? getWordTipForGenre(word, genre) : null;
          hint = genreTip || 'Check pronunciation';
        }
        return {
          id: `word-${li}-${wi}`,
          text: word,
          state,
          hint,
        };
      }),
    };
  });
}
