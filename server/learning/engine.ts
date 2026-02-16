export type SessionTip = {
  word: string;
  reason: string;
  tipKey: string;
};

export type NormalizedSessionLearningEvent = {
  id: string;
  userId: string;
  sessionId: string;
  songId?: string;
  genre?: string;
  title?: string;
  createdAt: string;
  durationSeconds: number;
  textAccuracy: number;
  pronunciationClarity: number;
  timingConsistency: "low" | "medium" | "high";
  transcript?: string;
  expectedWordCount: number;
  spokenWordCount: number;
  matchedWordCount: number;
  weakWords: string[];
  strongWords: string[];
  weakSounds: Record<string, number>;
  tips: SessionTip[];
};

export type NormalizedEasePocketLearningEvent = {
  id: string;
  userId: string;
  eventId: string;
  mode: "subdivision" | "silent" | "consonant" | "pocket" | "slow";
  bpm: number;
  grid: "beat" | "8th" | "16th";
  beatsPerBar: 2 | 4;
  eventCount: number;
  onTimePct: number;
  meanAbsMs: number;
  stdDevMs: number;
  avgOffsetMs: number;
  createdAt: string;
};

export type WordDifficultySummary = {
  word: string;
  attempts: number;
  failures: number;
  successes: number;
  failureRate: number;
};

export type TipEffectivenessSummary = {
  tipKey: string;
  shownCount: number;
  improvedCount: number;
  successScore: number;
};

export type UserLearningProfile = {
  userId: string;
  sessionCount: number;
  easePocketEventCount: number;
  weakWords: Array<{ word: string; count: number; weakRate: number }>;
  strongWords: Array<{ word: string; count: number; strongRate: number }>;
  weakSounds: Array<{ sound: string; count: number }>;
  genreSummary: Array<{ genre: string; sessions: number; avgAccuracy: number }>;
  trendSummary: {
    recentAvgAccuracy: number;
    baselineAvgAccuracy: number;
    deltaAccuracy: number;
    recentAvgClarity: number;
    timingHighRate: number;
  };
  tipSummary: Array<{
    tipKey: string;
    shownCount: number;
    improvedCount: number;
    successScore: number;
  }>;
  timingSummary: {
    sessionTimingConsistency: Record<"low" | "medium" | "high", number>;
    easePocketModes: Array<{
      mode: string;
      drills: number;
      avgOnTimePct: number;
      avgMeanAbsMs: number;
    }>;
  };
  updatedAt: string;
};

export type LearningRecommendations = {
  userId: string;
  focusWords: string[];
  globalChallengeWords: string[];
  suggestedTips: Array<{
    tipKey: string;
    successScore: number;
    rationale: string;
  }>;
  practicePlan: Array<{
    type: "lyrics" | "timing";
    title: string;
    reason: string;
    targetMode?: "subdivision" | "silent" | "consonant" | "pocket" | "slow";
  }>;
};

const WORD_RE = /[a-z0-9']+/gi;

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

function uniqueWords(words: string[]): string[] {
  return Array.from(new Set(words.filter(Boolean)));
}

function normalizeWord(word: string): string {
  return (word.toLowerCase().match(/[a-z0-9']+/g) || []).join("");
}

export function tokenizeWords(text: string): string[] {
  return (text.toLowerCase().match(WORD_RE) || []).filter(Boolean);
}

export function alignExpectedWordIndices(
  expected: string[],
  spoken: string[]
): Set<number> {
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

function wordLengthBucket(word: string): "short" | "medium" | "long" {
  if (word.length <= 3) return "short";
  if (word.length >= 8) return "long";
  return "medium";
}

export function buildTipKey(word: string, reason: string): string {
  const normalizedReason = reason
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const reasonKey = normalizedReason || "general-coaching";
  return `${reasonKey}:${wordLengthBucket(word)}`;
}

export function deriveWeakSoundCounts(words: string[]): Record<string, number> {
  const counts = new Map<string, number>();
  const add = (key: string) => counts.set(key, (counts.get(key) || 0) + 1);

  for (const rawWord of words) {
    const word = normalizeWord(rawWord);
    if (!word) continue;

    if (/[pbtdkg]/.test(word)) add("plosive_attack");
    if (/[fvszxhj]/.test(word)) add("fricative_clarity");
    if (/[lr]/.test(word)) add("liquid_control");
    if (/[mn]/.test(word) || /ng/.test(word)) add("nasal_balance");
    if (/[aeiou]{2,}/.test(word)) add("vowel_transition");
    if (/[bcdfghjklmnpqrstvwxyz]$/.test(word)) add("final_consonant");
  }

  return Object.fromEntries(counts.entries());
}

export function deriveSessionWordFeatures(params: {
  lyrics: string;
  transcript?: string;
  topToFix: Array<{ word: string; reason: string }>;
}): {
  expectedWords: string[];
  spokenWords: string[];
  matchedWords: string[];
  weakWords: string[];
  strongWords: string[];
  weakSounds: Record<string, number>;
  tips: SessionTip[];
} {
  const expectedWords = tokenizeWords(params.lyrics);
  const spokenWords = tokenizeWords(params.transcript || "");
  const matchedIndices = alignExpectedWordIndices(expectedWords, spokenWords);
  const matchedWords = uniqueWords(
    Array.from(matchedIndices.values()).map((index) => expectedWords[index] || "")
  );

  const weakWordsFromMisses: string[] = [];
  if (spokenWords.length > 0) {
    for (let i = 0; i < expectedWords.length; i += 1) {
      if (!matchedIndices.has(i)) {
        weakWordsFromMisses.push(expectedWords[i]);
      }
    }
  }

  const weakWords = uniqueWords([
    ...params.topToFix.map((fix) => normalizeWord(fix.word)).filter(Boolean),
    ...weakWordsFromMisses.map((word) => normalizeWord(word)).filter(Boolean),
  ]);

  const strongWordSet = new Set(matchedWords);
  for (const weakWord of weakWords) {
    strongWordSet.delete(weakWord);
  }
  const strongWords = Array.from(strongWordSet.values());
  const weakSounds = deriveWeakSoundCounts(weakWords);

  const tips = params.topToFix
    .map((fix) => {
      const word = normalizeWord(fix.word);
      const reason = fix.reason.trim();
      if (!word || !reason) {
        return null;
      }
      return {
        word,
        reason,
        tipKey: buildTipKey(word, reason),
      } satisfies SessionTip;
    })
    .filter((value): value is SessionTip => Boolean(value));

  return {
    expectedWords,
    spokenWords,
    matchedWords,
    weakWords,
    strongWords,
    weakSounds,
    tips,
  };
}

function sortDescByCount(entries: Map<string, number>): Array<[string, number]> {
  return Array.from(entries.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
}

export function buildUserLearningProfile(params: {
  userId: string;
  sessions: NormalizedSessionLearningEvent[];
  easePocketEvents: NormalizedEasePocketLearningEvent[];
}): UserLearningProfile {
  const sessions = [...params.sessions].sort((a, b) => {
    return Date.parse(a.createdAt) - Date.parse(b.createdAt);
  });
  const easePocketEvents = [...params.easePocketEvents].sort((a, b) => {
    return Date.parse(a.createdAt) - Date.parse(b.createdAt);
  });

  const weakWordCounts = new Map<string, number>();
  const strongWordCounts = new Map<string, number>();
  const weakSoundCounts = new Map<string, number>();
  const genreBuckets = new Map<string, { sessions: number; sumAccuracy: number }>();
  const timingCounts: Record<"low" | "medium" | "high", number> = {
    low: 0,
    medium: 0,
    high: 0,
  };
  const accuracySeries: number[] = [];
  const claritySeries: number[] = [];

  for (const session of sessions) {
    timingCounts[session.timingConsistency] += 1;
    accuracySeries.push(session.textAccuracy);
    claritySeries.push(session.pronunciationClarity);

    const genreKey = session.genre || "unknown";
    const currentGenre = genreBuckets.get(genreKey) || { sessions: 0, sumAccuracy: 0 };
    currentGenre.sessions += 1;
    currentGenre.sumAccuracy += session.textAccuracy;
    genreBuckets.set(genreKey, currentGenre);

    for (const word of uniqueWords(session.weakWords)) {
      weakWordCounts.set(word, (weakWordCounts.get(word) || 0) + 1);
    }
    for (const word of uniqueWords(session.strongWords)) {
      strongWordCounts.set(word, (strongWordCounts.get(word) || 0) + 1);
    }
    for (const [sound, count] of Object.entries(session.weakSounds)) {
      weakSoundCounts.set(sound, (weakSoundCounts.get(sound) || 0) + count);
    }
  }

  const tipStats = new Map<string, { shown: number; improved: number }>();
  for (let index = 1; index < sessions.length; index += 1) {
    const previousSession = sessions[index - 1];
    const currentSession = sessions[index];
    const currentWeak = new Set(currentSession.weakWords);

    for (const tip of previousSession.tips) {
      const stats = tipStats.get(tip.tipKey) || { shown: 0, improved: 0 };
      stats.shown += 1;
      if (!currentWeak.has(tip.word)) {
        stats.improved += 1;
      }
      tipStats.set(tip.tipKey, stats);
    }
  }

  const recentWindowSize = Math.min(6, accuracySeries.length);
  const previousWindowSize = Math.min(6, Math.max(0, accuracySeries.length - recentWindowSize));
  const recentSeries = accuracySeries.slice(-recentWindowSize);
  const baselineSeries =
    previousWindowSize > 0
      ? accuracySeries.slice(-(recentWindowSize + previousWindowSize), -recentWindowSize)
      : accuracySeries.slice(0, recentWindowSize);
  const recentAvgAccuracy = mean(recentSeries);
  const baselineAvgAccuracy = mean(baselineSeries);

  const modeStats = new Map<string, { drills: number; sumOnTime: number; sumMeanAbs: number }>();
  for (const event of easePocketEvents) {
    const bucket = modeStats.get(event.mode) || {
      drills: 0,
      sumOnTime: 0,
      sumMeanAbs: 0,
    };
    bucket.drills += 1;
    bucket.sumOnTime += event.onTimePct;
    bucket.sumMeanAbs += event.meanAbsMs;
    modeStats.set(event.mode, bucket);
  }

  const sessionCount = sessions.length;
  const weakWords = sortDescByCount(weakWordCounts).slice(0, 12).map(([word, count]) => ({
    word,
    count,
    weakRate: sessionCount > 0 ? Number((count / sessionCount).toFixed(3)) : 0,
  }));
  const strongWords = sortDescByCount(strongWordCounts).slice(0, 12).map(([word, count]) => ({
    word,
    count,
    strongRate: sessionCount > 0 ? Number((count / sessionCount).toFixed(3)) : 0,
  }));
  const weakSounds = sortDescByCount(weakSoundCounts).slice(0, 10).map(([sound, count]) => ({
    sound,
    count,
  }));

  const genreSummary = Array.from(genreBuckets.entries())
    .map(([genre, data]) => ({
      genre,
      sessions: data.sessions,
      avgAccuracy: data.sessions > 0 ? Math.round(data.sumAccuracy / data.sessions) : 0,
    }))
    .sort((a, b) => {
      if (b.sessions !== a.sessions) return b.sessions - a.sessions;
      return a.genre.localeCompare(b.genre);
    });

  const tipSummary = Array.from(tipStats.entries())
    .map(([tipKey, stats]) => {
      const successScore =
        stats.shown > 0 ? Number((stats.improved / stats.shown).toFixed(3)) : 0;
      return {
        tipKey,
        shownCount: stats.shown,
        improvedCount: stats.improved,
        successScore,
      };
    })
    .sort((a, b) => {
      if (b.successScore !== a.successScore) return b.successScore - a.successScore;
      return b.shownCount - a.shownCount;
    })
    .slice(0, 12);

  const easePocketModes = Array.from(modeStats.entries())
    .map(([mode, stats]) => ({
      mode,
      drills: stats.drills,
      avgOnTimePct: Number((stats.sumOnTime / Math.max(1, stats.drills)).toFixed(1)),
      avgMeanAbsMs: Number((stats.sumMeanAbs / Math.max(1, stats.drills)).toFixed(1)),
    }))
    .sort((a, b) => {
      if (b.drills !== a.drills) return b.drills - a.drills;
      return a.mode.localeCompare(b.mode);
    });

  return {
    userId: params.userId,
    sessionCount,
    easePocketEventCount: easePocketEvents.length,
    weakWords,
    strongWords,
    weakSounds,
    genreSummary,
    trendSummary: {
      recentAvgAccuracy: Number(recentAvgAccuracy.toFixed(1)),
      baselineAvgAccuracy: Number(baselineAvgAccuracy.toFixed(1)),
      deltaAccuracy: Number((recentAvgAccuracy - baselineAvgAccuracy).toFixed(1)),
      recentAvgClarity: Number(mean(claritySeries.slice(-Math.min(6, claritySeries.length))).toFixed(1)),
      timingHighRate:
        sessionCount > 0
          ? Number((timingCounts.high / sessionCount).toFixed(3))
          : 0,
    },
    tipSummary,
    timingSummary: {
      sessionTimingConsistency: timingCounts,
      easePocketModes,
    },
    updatedAt: new Date().toISOString(),
  };
}

function tipMatchesWordBucket(tipKey: string, word: string): boolean {
  const bucket = wordLengthBucket(word);
  return tipKey.endsWith(`:${bucket}`);
}

export function buildLearningRecommendations(params: {
  profile: UserLearningProfile;
  globalWords: WordDifficultySummary[];
  globalTips: TipEffectivenessSummary[];
}): LearningRecommendations {
  const { profile, globalWords, globalTips } = params;
  const focusWords = profile.weakWords.slice(0, 5).map((item) => item.word);
  const globalChallengeWords = globalWords
    .filter((item) => item.attempts >= 4)
    .slice(0, 5)
    .map((item) => item.word);

  const suggestedTips: Array<{
    tipKey: string;
    successScore: number;
    rationale: string;
  }> = [];

  for (const word of focusWords) {
    const bestTip = globalTips
      .filter((tip) => tip.shownCount >= 3 && tipMatchesWordBucket(tip.tipKey, word))
      .sort((a, b) => {
        if (b.successScore !== a.successScore) return b.successScore - a.successScore;
        return b.shownCount - a.shownCount;
      })[0];
    if (!bestTip) {
      continue;
    }
    suggestedTips.push({
      tipKey: bestTip.tipKey,
      successScore: bestTip.successScore,
      rationale: `High-impact coaching pattern for "${word}"`,
    });
  }

  const practicePlan: LearningRecommendations["practicePlan"] = [];
  if (focusWords.length > 0) {
    practicePlan.push({
      type: "lyrics",
      title: "Word Repair Drill",
      reason: `Target weak words: ${focusWords.slice(0, 3).join(", ")}`,
    });
  }

  const avgEasePocketOnTime = mean(
    profile.timingSummary.easePocketModes.map((item) => item.avgOnTimePct)
  );
  const needsTimingWork =
    profile.trendSummary.timingHighRate < 0.45 ||
    (profile.easePocketEventCount > 0 && avgEasePocketOnTime < 70);

  if (needsTimingWork) {
    practicePlan.push({
      type: "timing",
      title: "Silent Beat Challenge",
      reason: "Internal pulse consistency is below target.",
      targetMode: "silent",
    });
    practicePlan.push({
      type: "timing",
      title: "Pocket Control",
      reason: "Stabilize ahead/behind drift in microtiming.",
      targetMode: "pocket",
    });
  }

  const consonantPressure = profile.weakSounds.find(
    (item) => item.sound === "plosive_attack" || item.sound === "fricative_clarity"
  );
  if (consonantPressure && consonantPressure.count >= 3) {
    practicePlan.push({
      type: "timing",
      title: "Consonant Precision",
      reason: "Frequent consonant attack misses detected.",
      targetMode: "consonant",
    });
  }

  return {
    userId: profile.userId,
    focusWords,
    globalChallengeWords,
    suggestedTips: suggestedTips.slice(0, 5),
    practicePlan: practicePlan.slice(0, 5),
  };
}

export function toWordDifficultySummary(input: {
  word: string;
  attempts: number;
  failures: number;
  successes: number;
}): WordDifficultySummary {
  return {
    word: input.word,
    attempts: input.attempts,
    failures: input.failures,
    successes: input.successes,
    failureRate:
      input.attempts > 0
        ? Number(clamp(input.failures / input.attempts, 0, 1).toFixed(3))
        : 0,
  };
}

export function toTipEffectivenessSummary(input: {
  tipKey: string;
  shownCount: number;
  improvedCount: number;
}): TipEffectivenessSummary {
  return {
    tipKey: input.tipKey,
    shownCount: input.shownCount,
    improvedCount: input.improvedCount,
    successScore:
      input.shownCount > 0
        ? Number(clamp(input.improvedCount / input.shownCount, 0, 1).toFixed(3))
        : 0,
  };
}

