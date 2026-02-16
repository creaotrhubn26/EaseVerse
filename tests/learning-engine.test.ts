import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLearningRecommendations,
  buildTipKey,
  buildUserLearningProfile,
  toTipEffectivenessSummary,
  toWordDifficultySummary,
  type NormalizedEasePocketLearningEvent,
  type NormalizedSessionLearningEvent,
} from "../server/learning/engine";

test("learning profile aggregates weak words and tip effectiveness across sessions", () => {
  const tipWorld = buildTipKey("world", "Crisp consonant attack");
  const tipTest = buildTipKey("test", "Sustain vowel shape");

  const sessions: NormalizedSessionLearningEvent[] = [
    {
      id: "a",
      userId: "u1",
      sessionId: "s1",
      songId: "song1",
      genre: "pop",
      title: "Take 1",
      createdAt: "2026-02-16T00:00:00.000Z",
      durationSeconds: 32,
      textAccuracy: 52,
      pronunciationClarity: 48,
      timingConsistency: "low",
      transcript: "hello test",
      expectedWordCount: 10,
      spokenWordCount: 8,
      matchedWordCount: 5,
      weakWords: ["world", "test"],
      strongWords: ["hello"],
      weakSounds: { plosive_attack: 2 },
      tips: [{ word: "world", reason: "Crisp consonant attack", tipKey: tipWorld }],
    },
    {
      id: "b",
      userId: "u1",
      sessionId: "s2",
      songId: "song1",
      genre: "pop",
      title: "Take 2",
      createdAt: "2026-02-16T00:05:00.000Z",
      durationSeconds: 30,
      textAccuracy: 68,
      pronunciationClarity: 66,
      timingConsistency: "medium",
      transcript: "hello world test",
      expectedWordCount: 10,
      spokenWordCount: 10,
      matchedWordCount: 7,
      weakWords: ["test"],
      strongWords: ["hello", "world"],
      weakSounds: { vowel_transition: 1 },
      tips: [{ word: "test", reason: "Sustain vowel shape", tipKey: tipTest }],
    },
    {
      id: "c",
      userId: "u1",
      sessionId: "s3",
      songId: "song1",
      genre: "pop",
      title: "Take 3",
      createdAt: "2026-02-16T00:10:00.000Z",
      durationSeconds: 29,
      textAccuracy: 82,
      pronunciationClarity: 79,
      timingConsistency: "high",
      transcript: "hello world test",
      expectedWordCount: 10,
      spokenWordCount: 10,
      matchedWordCount: 9,
      weakWords: [],
      strongWords: ["hello", "world", "test"],
      weakSounds: {},
      tips: [],
    },
  ];

  const easePocketEvents: NormalizedEasePocketLearningEvent[] = [
    {
      id: "e1",
      userId: "u1",
      eventId: "ep1",
      mode: "silent",
      bpm: 96,
      grid: "beat",
      beatsPerBar: 4,
      eventCount: 48,
      onTimePct: 54,
      meanAbsMs: 43,
      stdDevMs: 21,
      avgOffsetMs: 13,
      createdAt: "2026-02-16T00:06:00.000Z",
    },
  ];

  const profile = buildUserLearningProfile({
    userId: "u1",
    sessions,
    easePocketEvents,
  });

  assert.equal(profile.userId, "u1");
  assert.equal(profile.sessionCount, 3);
  assert.equal(profile.easePocketEventCount, 1);
  assert.equal(profile.weakWords[0]?.word, "test");
  assert.equal(profile.tipSummary[0]?.shownCount, 1);
  assert.equal(profile.tipSummary[0]?.improvedCount, 1);
  assert.ok(profile.trendSummary.recentAvgAccuracy >= profile.trendSummary.baselineAvgAccuracy);
});

test("recommendations use profile + global model to produce practice plan", () => {
  const profile = buildUserLearningProfile({
    userId: "u2",
    sessions: [
      {
        id: "s1",
        userId: "u2",
        sessionId: "s1",
        createdAt: "2026-02-16T00:00:00.000Z",
        durationSeconds: 28,
        textAccuracy: 45,
        pronunciationClarity: 42,
        timingConsistency: "low",
        expectedWordCount: 10,
        spokenWordCount: 7,
        matchedWordCount: 4,
        weakWords: ["timing", "attack"],
        strongWords: ["hello"],
        weakSounds: { plosive_attack: 4 },
        tips: [],
      } as NormalizedSessionLearningEvent,
    ],
    easePocketEvents: [
      {
        id: "e1",
        userId: "u2",
        eventId: "e1",
        mode: "silent",
        bpm: 100,
        grid: "beat",
        beatsPerBar: 4,
        eventCount: 30,
        onTimePct: 52,
        meanAbsMs: 47,
        stdDevMs: 25,
        avgOffsetMs: 14,
        createdAt: "2026-02-16T00:01:00.000Z",
      },
    ],
  });

  const recommendations = buildLearningRecommendations({
    profile,
    globalWords: [
      toWordDifficultySummary({
        word: "timing",
        attempts: 50,
        failures: 31,
        successes: 15,
      }),
    ],
    globalTips: [
      toTipEffectivenessSummary({
        tipKey: buildTipKey("timing", "Crisp consonant attack"),
        shownCount: 10,
        improvedCount: 7,
      }),
    ],
  });

  assert.equal(recommendations.userId, "u2");
  assert.ok(recommendations.focusWords.includes("timing"));
  assert.ok(recommendations.globalChallengeWords.includes("timing"));
  assert.ok(recommendations.practicePlan.some((plan) => plan.targetMode === "silent"));
  assert.ok(recommendations.practicePlan.some((plan) => plan.targetMode === "consonant"));
});
