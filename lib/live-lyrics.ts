import type { GenreId, LiveMode, LyricLine } from './types';
import { getWordTipForGenre } from '@/constants/genres';

const WORD_RE = /[a-z0-9']+/gi;

type WordPosition = {
  lineIndex: number;
  wordIndex: number;
  text: string;
};

export type LiveLyricProgress = {
  activeFlatIndex: number;
  activeLineIndex: number;
  activeWordIndex: number;
  confirmedIndices: Set<number>;
  totalWords: number;
};

function tokenizeWords(text: string): string[] {
  return (text.toLowerCase().match(WORD_RE) || []).filter(Boolean);
}

function buildWordPositions(lyrics: string): WordPosition[] {
  const lines = lyrics.split('\n').filter((line) => line.trim().length > 0);
  const positions: WordPosition[] = [];

  lines.forEach((line, lineIndex) => {
    const words = line.split(' ').filter((word) => word.trim().length > 0);
    words.forEach((word, wordIndex) => {
      positions.push({ lineIndex, wordIndex, text: word });
    });
  });

  return positions;
}

function lowerBound(sorted: number[], target: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (sorted[mid] < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

function alignWords(expected: string[], spoken: string[]): Set<number> {
  const indicesByToken = new Map<string, number[]>();
  expected.forEach((token, index) => {
    if (!token) {
      return;
    }
    const existing = indicesByToken.get(token);
    if (existing) {
      existing.push(index);
    } else {
      indicesByToken.set(token, [index]);
    }
  });

  const matchedIndices = new Set<number>();
  let expectedCursor = 0;
  for (const token of spoken) {
    const positions = indicesByToken.get(token);
    if (!positions) {
      continue;
    }
    const posIndex = lowerBound(positions, expectedCursor);
    if (posIndex >= positions.length) {
      continue;
    }
    const matched = positions[posIndex];
    matchedIndices.add(matched);
    expectedCursor = matched + 1;
  }

  return matchedIndices;
}

function contiguousPrefixMatches(matchedIndices: Set<number>, totalWords: number): Set<number> {
  const contiguous = new Set<number>();
  for (let index = 0; index < totalWords; index += 1) {
    if (!matchedIndices.has(index)) {
      break;
    }
    contiguous.add(index);
  }
  return contiguous;
}

function toLineWordPosition(flatIndex: number, positions: WordPosition[]): {
  lineIndex: number;
  wordIndex: number;
} {
  if (flatIndex < 0) {
    return { lineIndex: -1, wordIndex: -1 };
  }
  if (positions.length === 0) {
    return { lineIndex: 0, wordIndex: 0 };
  }

  const clamped = Math.max(0, Math.min(flatIndex, positions.length - 1));
  const position = positions[clamped];
  return { lineIndex: position.lineIndex, wordIndex: position.wordIndex };
}

export function getLiveLyricProgress(
  lyrics: string,
  transcript: string,
  liveMode: LiveMode
): LiveLyricProgress {
  const positions = buildWordPositions(lyrics);
  const expectedTokens = positions.map((position) => tokenizeWords(position.text)[0]).filter(Boolean);
  if (expectedTokens.length === 0) {
    return {
      activeFlatIndex: -1,
      activeLineIndex: -1,
      activeWordIndex: -1,
      confirmedIndices: new Set<number>(),
      totalWords: 0,
    };
  }
  const spokenTokens = tokenizeWords(transcript);
  if (spokenTokens.length === 0) {
    return {
      activeFlatIndex: -1,
      activeLineIndex: -1,
      activeWordIndex: -1,
      confirmedIndices: new Set<number>(),
      totalWords: expectedTokens.length,
    };
  }
  const allMatched = alignWords(expectedTokens, spokenTokens);

  const confirmedIndices =
    liveMode === 'stability'
      ? contiguousPrefixMatches(allMatched, expectedTokens.length)
      : allMatched;

  let activeFlatIndex = 0;
  while (activeFlatIndex < expectedTokens.length && confirmedIndices.has(activeFlatIndex)) {
    activeFlatIndex += 1;
  }

  if (activeFlatIndex >= expectedTokens.length) {
    activeFlatIndex = expectedTokens.length - 1;
  }

  const activePosition = toLineWordPosition(activeFlatIndex, positions);

  return {
    activeFlatIndex,
    activeLineIndex: activePosition.lineIndex,
    activeWordIndex: activePosition.wordIndex,
    confirmedIndices,
    totalWords: expectedTokens.length,
  };
}

export function buildLiveLyricLines(params: {
  lyrics: string;
  activeFlatIndex: number;
  confirmedIndices: Set<number>;
  genre?: GenreId;
}): LyricLine[] {
  const { lyrics, activeFlatIndex, confirmedIndices, genre } = params;
  const lines = lyrics.split('\n').filter((line) => line.trim().length > 0);
  let flatIndex = 0;

  return lines.map((line, lineIndex) => {
    const words = line.split(' ').filter((word) => word.trim().length > 0);
    return {
      id: `line-${lineIndex}`,
      words: words.map((word, wordIndex) => {
        let state: LyricLine['words'][number]['state'] = 'upcoming';
        if (confirmedIndices.has(flatIndex)) {
          state = 'confirmed';
        } else if (flatIndex === activeFlatIndex) {
          state = 'active';
        }

        let hint: string | undefined;
        if (state === 'active') {
          hint = genre ? getWordTipForGenre(word, genre) || undefined : undefined;
        }

        const entry = {
          id: `word-${lineIndex}-${wordIndex}`,
          text: word,
          state,
          hint,
        } satisfies LyricLine['words'][number];

        flatIndex += 1;
        return entry;
      }),
    };
  });
}
