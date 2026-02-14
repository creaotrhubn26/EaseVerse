export type TimingConsistency = 'low' | 'medium' | 'high';

export interface WordFix {
  word: string;
  reason: string;
}

export interface SessionInsights {
  textAccuracy: number;
  pronunciationClarity: number;
  timingConsistency: TimingConsistency;
  topToFix: WordFix[];
}

export interface SessionScoringResult {
  transcript: string;
  expectedWordCount: number;
  spokenWordCount: number;
  matchedWordCount: number;
  insights: SessionInsights;
}

interface BuildScoringInput {
  expectedLyrics: string;
  transcript: string;
  durationSeconds?: number;
}

const WORD_RE = /[a-z0-9']+/gi;

function tokenizeWords(text: string): string[] {
  return (text.toLowerCase().match(WORD_RE) || []).filter(Boolean);
}

function alignWords(expected: string[], spoken: string[]): Set<number> {
  const dp: number[][] = Array.from({ length: expected.length + 1 }, () =>
    Array(spoken.length + 1).fill(0)
  );

  for (let i = 1; i <= expected.length; i += 1) {
    for (let j = 1; j <= spoken.length; j += 1) {
      if (expected[i - 1] === spoken[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const matchedExpectedIndices = new Set<number>();
  let i = expected.length;
  let j = spoken.length;
  while (i > 0 && j > 0) {
    if (expected[i - 1] === spoken[j - 1]) {
      matchedExpectedIndices.add(i - 1);
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  return matchedExpectedIndices;
}

function buildFixReason(word: string): string {
  if (word.length >= 9) {
    return 'Break this word into clear syllables';
  }
  if (/[aeiou]{2,}/i.test(word)) {
    return 'Sustain the vowel shape more clearly';
  }
  if (word.length <= 3) {
    return 'Crisp consonants will make this clearer';
  }
  return 'Not clearly detected in recording';
}

function deriveTimingConsistency(
  matchedRatio: number,
  expectedWordCount: number,
  spokenWordCount: number,
  durationSeconds?: number
): TimingConsistency {
  if (!durationSeconds || durationSeconds <= 0) {
    if (matchedRatio >= 0.85) return 'high';
    if (matchedRatio >= 0.6) return 'medium';
    return 'low';
  }

  const expectedRate = expectedWordCount / durationSeconds;
  const spokenRate = spokenWordCount / durationSeconds;
  const paceDelta = Math.abs(spokenRate - expectedRate) / Math.max(0.01, expectedRate);

  if (matchedRatio >= 0.8 && paceDelta < 0.2) return 'high';
  if (matchedRatio >= 0.5 && paceDelta < 0.45) return 'medium';
  return 'low';
}

function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function buildSessionScoring({
  expectedLyrics,
  transcript,
  durationSeconds,
}: BuildScoringInput): SessionScoringResult {
  const expectedWords = tokenizeWords(expectedLyrics);
  const spokenWords = tokenizeWords(transcript);
  const matchedExpectedIndices = alignWords(expectedWords, spokenWords);

  const expectedWordCount = expectedWords.length;
  const spokenWordCount = spokenWords.length;
  const matchedWordCount = matchedExpectedIndices.size;

  const accuracyRatio = matchedWordCount / Math.max(1, expectedWordCount);
  const precisionRatio = matchedWordCount / Math.max(1, spokenWordCount);

  const textAccuracy = clampScore(accuracyRatio * 100);
  const pronunciationClarity = clampScore((accuracyRatio * 0.65 + precisionRatio * 0.35) * 100);
  const timingConsistency = deriveTimingConsistency(
    accuracyRatio,
    expectedWordCount,
    spokenWordCount,
    durationSeconds
  );

  const seen = new Set<string>();
  const topToFix: WordFix[] = [];
  for (let index = 0; index < expectedWords.length; index += 1) {
    if (matchedExpectedIndices.has(index)) {
      continue;
    }
    const word = expectedWords[index];
    if (seen.has(word)) {
      continue;
    }
    seen.add(word);
    topToFix.push({
      word,
      reason: buildFixReason(word),
    });
    if (topToFix.length >= 5) {
      break;
    }
  }

  if (topToFix.length === 0) {
    topToFix.push({
      word: 'delivery',
      reason: 'Keep airflow steady and diction intentional',
    });
  }

  return {
    transcript,
    expectedWordCount,
    spokenWordCount,
    matchedWordCount,
    insights: {
      textAccuracy,
      pronunciationClarity,
      timingConsistency,
      topToFix,
    },
  };
}
