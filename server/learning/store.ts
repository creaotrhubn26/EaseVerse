import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  buildLearningRecommendations,
  buildTipKey,
  buildUserLearningProfile,
  deriveSessionWordFeatures,
  toTipEffectivenessSummary,
  toWordDifficultySummary,
  type LearningRecommendations,
  type NormalizedEasePocketLearningEvent,
  type NormalizedSessionLearningEvent,
  type TipEffectivenessSummary,
  type UserLearningProfile,
  type WordDifficultySummary,
} from "./engine";

type SessionIngestInput = {
  userId: string;
  sessionId: string;
  songId?: string;
  genre?: string;
  title?: string;
  createdAt: string;
  durationSeconds: number;
  lyrics: string;
  transcript?: string;
  insights: {
    textAccuracy: number;
    pronunciationClarity: number;
    timingConsistency: "low" | "medium" | "high";
    topToFix: Array<{ word: string; reason: string }>;
  };
};

type EasePocketIngestInput = {
  userId: string;
  eventId: string;
  mode: "subdivision" | "silent" | "consonant" | "pocket" | "slow";
  bpm: number;
  grid: "beat" | "8th" | "16th";
  beatsPerBar: 2 | 4;
  createdAt: string;
  stats: {
    eventCount: number;
    onTimePct: number;
    meanAbsMs: number;
    stdDevMs: number;
    avgOffsetMs: number;
  };
};

type LearningGlobalModel = {
  words: WordDifficultySummary[];
  tips: TipEffectivenessSummary[];
};

export type LearningIngestResult = {
  userId: string;
  deduplicated: boolean;
  profile: UserLearningProfile;
  recommendations: LearningRecommendations;
};

export interface LearningStore {
  ingestSession(input: SessionIngestInput): Promise<LearningIngestResult>;
  ingestEasePocket(input: EasePocketIngestInput): Promise<LearningIngestResult>;
  getUserProfile(userId: string): Promise<UserLearningProfile | null>;
  getRecommendations(userId: string): Promise<LearningRecommendations | null>;
  getGlobalModel(limit?: number): Promise<LearningGlobalModel>;
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function normalizeTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return new Date().toISOString();
  }
  return new Date(parsed).toISOString();
}

function buildDefaultProfile(userId: string): UserLearningProfile {
  return {
    userId,
    sessionCount: 0,
    easePocketEventCount: 0,
    weakWords: [],
    strongWords: [],
    weakSounds: [],
    genreSummary: [],
    trendSummary: {
      recentAvgAccuracy: 0,
      baselineAvgAccuracy: 0,
      deltaAccuracy: 0,
      recentAvgClarity: 0,
      timingHighRate: 0,
    },
    tipSummary: [],
    timingSummary: {
      sessionTimingConsistency: { low: 0, medium: 0, high: 0 },
      easePocketModes: [],
    },
    updatedAt: new Date().toISOString(),
  };
}

class MemoryLearningStore implements LearningStore {
  private readonly sessionEventsByUser = new Map<string, NormalizedSessionLearningEvent[]>();
  private readonly easePocketEventsByUser = new Map<
    string,
    NormalizedEasePocketLearningEvent[]
  >();
  private readonly dedupeSessions = new Set<string>();
  private readonly dedupeEasePocket = new Set<string>();
  private readonly globalWords = new Map<
    string,
    { attempts: number; failures: number; successes: number }
  >();
  private readonly globalTips = new Map<string, { shownCount: number; improvedCount: number }>();
  private readonly cachedProfiles = new Map<string, UserLearningProfile>();

  private getUserSessions(userId: string): NormalizedSessionLearningEvent[] {
    return this.sessionEventsByUser.get(userId) || [];
  }

  private getUserEasePocketEvents(userId: string): NormalizedEasePocketLearningEvent[] {
    return this.easePocketEventsByUser.get(userId) || [];
  }

  private buildRecommendationsFromProfile(profile: UserLearningProfile): LearningRecommendations {
    const globalModel = this.getGlobalModelSync(50);
    return buildLearningRecommendations({
      profile,
      globalWords: globalModel.words,
      globalTips: globalModel.tips,
    });
  }

  private getGlobalModelSync(limit = 20): LearningGlobalModel {
    const words = Array.from(this.globalWords.entries())
      .map(([word, stats]) =>
        toWordDifficultySummary({
          word,
          attempts: stats.attempts,
          failures: stats.failures,
          successes: stats.successes,
        })
      )
      .sort((a, b) => {
        if (b.failureRate !== a.failureRate) return b.failureRate - a.failureRate;
        return b.attempts - a.attempts;
      })
      .slice(0, limit);

    const tips = Array.from(this.globalTips.entries())
      .map(([tipKey, stats]) =>
        toTipEffectivenessSummary({
          tipKey,
          shownCount: stats.shownCount,
          improvedCount: stats.improvedCount,
        })
      )
      .sort((a, b) => {
        if (b.successScore !== a.successScore) return b.successScore - a.successScore;
        return b.shownCount - a.shownCount;
      })
      .slice(0, limit);

    return { words, tips };
  }

  private rebuildUserProfile(userId: string): UserLearningProfile {
    const profile = buildUserLearningProfile({
      userId,
      sessions: this.getUserSessions(userId),
      easePocketEvents: this.getUserEasePocketEvents(userId),
    });
    this.cachedProfiles.set(userId, profile);
    return profile;
  }

  async ingestSession(input: SessionIngestInput): Promise<LearningIngestResult> {
    const dedupeKey = `${input.userId}:${input.sessionId}`;
    if (this.dedupeSessions.has(dedupeKey)) {
      const profile = this.cachedProfiles.get(input.userId) || this.rebuildUserProfile(input.userId);
      return {
        userId: input.userId,
        deduplicated: true,
        profile,
        recommendations: this.buildRecommendationsFromProfile(profile),
      };
    }

    const features = deriveSessionWordFeatures({
      lyrics: input.lyrics,
      transcript: input.transcript,
      topToFix: input.insights.topToFix,
    });

    const event: NormalizedSessionLearningEvent = {
      id: randomUUID(),
      userId: input.userId,
      sessionId: input.sessionId,
      songId: input.songId,
      genre: input.genre,
      title: input.title,
      createdAt: normalizeTimestamp(input.createdAt),
      durationSeconds: input.durationSeconds,
      textAccuracy: input.insights.textAccuracy,
      pronunciationClarity: input.insights.pronunciationClarity,
      timingConsistency: input.insights.timingConsistency,
      transcript: input.transcript,
      expectedWordCount: features.expectedWords.length,
      spokenWordCount: features.spokenWords.length,
      matchedWordCount: features.matchedWords.length,
      weakWords: features.weakWords,
      strongWords: features.strongWords,
      weakSounds: features.weakSounds,
      tips: features.tips,
    };

    const sessions = this.getUserSessions(input.userId);
    const previous = sessions.length > 0 ? sessions[sessions.length - 1] : null;
    sessions.push(event);
    this.sessionEventsByUser.set(input.userId, sessions);
    this.dedupeSessions.add(dedupeKey);

    const weakWordSet = new Set(event.weakWords);
    const strongWordSet = new Set(event.strongWords);
    for (const expectedWord of new Set(features.expectedWords)) {
      const stats = this.globalWords.get(expectedWord) || {
        attempts: 0,
        failures: 0,
        successes: 0,
      };
      stats.attempts += 1;
      if (weakWordSet.has(expectedWord)) {
        stats.failures += 1;
      }
      if (strongWordSet.has(expectedWord)) {
        stats.successes += 1;
      }
      this.globalWords.set(expectedWord, stats);
    }

    if (previous) {
      for (const tip of previous.tips) {
        const stats = this.globalTips.get(tip.tipKey) || {
          shownCount: 0,
          improvedCount: 0,
        };
        stats.shownCount += 1;
        if (!weakWordSet.has(tip.word)) {
          stats.improvedCount += 1;
        }
        this.globalTips.set(tip.tipKey, stats);
      }
    }

    const profile = this.rebuildUserProfile(input.userId);
    return {
      userId: input.userId,
      deduplicated: false,
      profile,
      recommendations: this.buildRecommendationsFromProfile(profile),
    };
  }

  async ingestEasePocket(input: EasePocketIngestInput): Promise<LearningIngestResult> {
    const dedupeKey = `${input.userId}:${input.eventId}`;
    if (this.dedupeEasePocket.has(dedupeKey)) {
      const profile = this.cachedProfiles.get(input.userId) || this.rebuildUserProfile(input.userId);
      return {
        userId: input.userId,
        deduplicated: true,
        profile,
        recommendations: this.buildRecommendationsFromProfile(profile),
      };
    }

    const event: NormalizedEasePocketLearningEvent = {
      id: randomUUID(),
      userId: input.userId,
      eventId: input.eventId,
      mode: input.mode,
      bpm: input.bpm,
      grid: input.grid,
      beatsPerBar: input.beatsPerBar,
      eventCount: input.stats.eventCount,
      onTimePct: input.stats.onTimePct,
      meanAbsMs: input.stats.meanAbsMs,
      stdDevMs: input.stats.stdDevMs,
      avgOffsetMs: input.stats.avgOffsetMs,
      createdAt: normalizeTimestamp(input.createdAt),
    };

    const events = this.getUserEasePocketEvents(input.userId);
    events.push(event);
    this.easePocketEventsByUser.set(input.userId, events);
    this.dedupeEasePocket.add(dedupeKey);

    const profile = this.rebuildUserProfile(input.userId);
    return {
      userId: input.userId,
      deduplicated: false,
      profile,
      recommendations: this.buildRecommendationsFromProfile(profile),
    };
  }

  async getUserProfile(userId: string): Promise<UserLearningProfile | null> {
    return this.cachedProfiles.get(userId) || this.rebuildUserProfile(userId);
  }

  async getRecommendations(userId: string): Promise<LearningRecommendations | null> {
    const profile = this.cachedProfiles.get(userId) || this.rebuildUserProfile(userId);
    return this.buildRecommendationsFromProfile(profile);
  }

  async getGlobalModel(limit = 20): Promise<LearningGlobalModel> {
    return this.getGlobalModelSync(limit);
  }
}

class PostgresLearningStore implements LearningStore {
  private readonly pool: Pool;
  private tableReadyPromise: Promise<void> | null = null;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  private async ensureTables(): Promise<void> {
    if (!this.tableReadyPromise) {
      this.tableReadyPromise = (async () => {
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS learning_session_events (
            id VARCHAR(120) PRIMARY KEY,
            user_id VARCHAR(120) NOT NULL,
            session_id VARCHAR(120) NOT NULL,
            song_id VARCHAR(120),
            genre VARCHAR(48),
            title VARCHAR(240),
            created_at TIMESTAMPTZ NOT NULL,
            duration_seconds INTEGER NOT NULL,
            text_accuracy INTEGER NOT NULL,
            pronunciation_clarity INTEGER NOT NULL,
            timing_consistency VARCHAR(16) NOT NULL,
            transcript TEXT,
            expected_word_count INTEGER NOT NULL,
            spoken_word_count INTEGER NOT NULL,
            matched_word_count INTEGER NOT NULL,
            weak_words JSONB NOT NULL DEFAULT '[]'::jsonb,
            strong_words JSONB NOT NULL DEFAULT '[]'::jsonb,
            weak_sounds JSONB NOT NULL DEFAULT '{}'::jsonb,
            tips JSONB NOT NULL DEFAULT '[]'::jsonb,
            raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (user_id, session_id)
          );
        `);

        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS learning_easepocket_events (
            id VARCHAR(120) PRIMARY KEY,
            user_id VARCHAR(120) NOT NULL,
            event_id VARCHAR(120) NOT NULL,
            mode VARCHAR(32) NOT NULL,
            bpm INTEGER NOT NULL,
            grid VARCHAR(16) NOT NULL,
            beats_per_bar INTEGER NOT NULL,
            event_count INTEGER NOT NULL,
            on_time_pct NUMERIC(8, 3) NOT NULL,
            mean_abs_ms NUMERIC(10, 3) NOT NULL,
            std_dev_ms NUMERIC(10, 3) NOT NULL,
            avg_offset_ms NUMERIC(10, 3) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (user_id, event_id)
          );
        `);

        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS learning_word_difficulty (
            word VARCHAR(80) PRIMARY KEY,
            attempts INTEGER NOT NULL DEFAULT 0,
            failures INTEGER NOT NULL DEFAULT 0,
            successes INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);

        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS learning_tip_effectiveness (
            tip_key VARCHAR(160) PRIMARY KEY,
            shown_count INTEGER NOT NULL DEFAULT 0,
            improved_count INTEGER NOT NULL DEFAULT 0,
            success_score NUMERIC(8, 4) NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);

        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS learning_user_profiles (
            user_id VARCHAR(120) PRIMARY KEY,
            session_count INTEGER NOT NULL DEFAULT 0,
            easepocket_event_count INTEGER NOT NULL DEFAULT 0,
            weak_words JSONB NOT NULL DEFAULT '[]'::jsonb,
            strong_words JSONB NOT NULL DEFAULT '[]'::jsonb,
            weak_sounds JSONB NOT NULL DEFAULT '[]'::jsonb,
            genre_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
            trend_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
            tip_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
            timing_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);

        await this.pool.query(`
          CREATE INDEX IF NOT EXISTS idx_learning_session_user_created
          ON learning_session_events (user_id, created_at DESC);
        `);
        await this.pool.query(`
          CREATE INDEX IF NOT EXISTS idx_learning_easepocket_user_created
          ON learning_easepocket_events (user_id, created_at DESC);
        `);
      })();
    }
    return this.tableReadyPromise;
  }

  private async fetchUserSessions(userId: string): Promise<NormalizedSessionLearningEvent[]> {
    await this.ensureTables();
    const result = await this.pool.query(
      `
        SELECT *
        FROM learning_session_events
        WHERE user_id = $1
        ORDER BY created_at ASC
        LIMIT 240
      `,
      [userId]
    );

    return result.rows.map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      sessionId: String(row.session_id),
      songId: row.song_id ? String(row.song_id) : undefined,
      genre: row.genre ? String(row.genre) : undefined,
      title: row.title ? String(row.title) : undefined,
      createdAt: new Date(row.created_at).toISOString(),
      durationSeconds: Number(row.duration_seconds),
      textAccuracy: Number(row.text_accuracy),
      pronunciationClarity: Number(row.pronunciation_clarity),
      timingConsistency: String(row.timing_consistency) as "low" | "medium" | "high",
      transcript: row.transcript ? String(row.transcript) : undefined,
      expectedWordCount: Number(row.expected_word_count),
      spokenWordCount: Number(row.spoken_word_count),
      matchedWordCount: Number(row.matched_word_count),
      weakWords: parseJsonValue<string[]>(row.weak_words, []),
      strongWords: parseJsonValue<string[]>(row.strong_words, []),
      weakSounds: parseJsonValue<Record<string, number>>(row.weak_sounds, {}),
      tips: parseJsonValue<Array<{ word: string; reason: string; tipKey: string }>>(
        row.tips,
        []
      ),
    }));
  }

  private async fetchUserEasePocketEvents(
    userId: string
  ): Promise<NormalizedEasePocketLearningEvent[]> {
    await this.ensureTables();
    const result = await this.pool.query(
      `
        SELECT *
        FROM learning_easepocket_events
        WHERE user_id = $1
        ORDER BY created_at ASC
        LIMIT 320
      `,
      [userId]
    );

    return result.rows.map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      eventId: String(row.event_id),
      mode: String(row.mode) as "subdivision" | "silent" | "consonant" | "pocket" | "slow",
      bpm: Number(row.bpm),
      grid: String(row.grid) as "beat" | "8th" | "16th",
      beatsPerBar: Number(row.beats_per_bar) as 2 | 4,
      eventCount: Number(row.event_count),
      onTimePct: Number(row.on_time_pct),
      meanAbsMs: Number(row.mean_abs_ms),
      stdDevMs: Number(row.std_dev_ms),
      avgOffsetMs: Number(row.avg_offset_ms),
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  private async persistProfile(profile: UserLearningProfile): Promise<void> {
    await this.ensureTables();
    await this.pool.query(
      `
        INSERT INTO learning_user_profiles (
          user_id,
          session_count,
          easepocket_event_count,
          weak_words,
          strong_words,
          weak_sounds,
          genre_summary,
          trend_summary,
          tip_summary,
          timing_summary,
          updated_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          session_count = EXCLUDED.session_count,
          easepocket_event_count = EXCLUDED.easepocket_event_count,
          weak_words = EXCLUDED.weak_words,
          strong_words = EXCLUDED.strong_words,
          weak_sounds = EXCLUDED.weak_sounds,
          genre_summary = EXCLUDED.genre_summary,
          trend_summary = EXCLUDED.trend_summary,
          tip_summary = EXCLUDED.tip_summary,
          timing_summary = EXCLUDED.timing_summary,
          updated_at = NOW()
      `,
      [
        profile.userId,
        profile.sessionCount,
        profile.easePocketEventCount,
        JSON.stringify(profile.weakWords),
        JSON.stringify(profile.strongWords),
        JSON.stringify(profile.weakSounds),
        JSON.stringify(profile.genreSummary),
        JSON.stringify(profile.trendSummary),
        JSON.stringify(profile.tipSummary),
        JSON.stringify(profile.timingSummary),
      ]
    );
  }

  private async buildAndPersistProfile(userId: string): Promise<UserLearningProfile> {
    const [sessions, easePocketEvents] = await Promise.all([
      this.fetchUserSessions(userId),
      this.fetchUserEasePocketEvents(userId),
    ]);
    const profile = buildUserLearningProfile({
      userId,
      sessions,
      easePocketEvents,
    });
    await this.persistProfile(profile);
    return profile;
  }

  private async fetchGlobalModel(limit = 20): Promise<LearningGlobalModel> {
    await this.ensureTables();
    const [wordsResult, tipsResult] = await Promise.all([
      this.pool.query(
        `
          SELECT
            word,
            attempts,
            failures,
            successes
          FROM learning_word_difficulty
          WHERE attempts > 0
          ORDER BY (failures::float / NULLIF(attempts, 0)) DESC, attempts DESC
          LIMIT $1
        `,
        [limit]
      ),
      this.pool.query(
        `
          SELECT
            tip_key,
            shown_count,
            improved_count,
            success_score
          FROM learning_tip_effectiveness
          WHERE shown_count > 0
          ORDER BY success_score DESC, shown_count DESC
          LIMIT $1
        `,
        [limit]
      ),
    ]);

    const words = wordsResult.rows.map((row) =>
      toWordDifficultySummary({
        word: String(row.word),
        attempts: Number(row.attempts),
        failures: Number(row.failures),
        successes: Number(row.successes),
      })
    );

    const tips = tipsResult.rows.map((row) =>
      toTipEffectivenessSummary({
        tipKey: String(row.tip_key),
        shownCount: Number(row.shown_count),
        improvedCount: Number(row.improved_count),
      })
    );

    return { words, tips };
  }

  private async updateGlobalWordDifficulty(params: {
    expectedWords: string[];
    weakWords: string[];
    strongWords: string[];
  }): Promise<void> {
    const expectedUnique = Array.from(new Set(params.expectedWords));
    const weakSet = new Set(params.weakWords);
    const strongSet = new Set(params.strongWords);

    await this.ensureTables();
    for (const word of expectedUnique) {
      await this.pool.query(
        `
          INSERT INTO learning_word_difficulty (word, attempts, failures, successes, updated_at)
          VALUES ($1, 1, $2, $3, NOW())
          ON CONFLICT (word)
          DO UPDATE SET
            attempts = learning_word_difficulty.attempts + 1,
            failures = learning_word_difficulty.failures + EXCLUDED.failures,
            successes = learning_word_difficulty.successes + EXCLUDED.successes,
            updated_at = NOW()
        `,
        [word, weakSet.has(word) ? 1 : 0, strongSet.has(word) ? 1 : 0]
      );
    }
  }

  private async updateTipEffectivenessFromPreviousSession(params: {
    userId: string;
    currentWeakWords: string[];
    currentCreatedAt: string;
  }): Promise<void> {
    await this.ensureTables();
    const previousResult = await this.pool.query(
      `
        SELECT tips
        FROM learning_session_events
        WHERE user_id = $1
          AND created_at < $2::timestamptz
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [params.userId, params.currentCreatedAt]
    );

    if (previousResult.rows.length === 0) {
      return;
    }

    const tips = parseJsonValue<Array<{ word: string; tipKey?: string; reason?: string }>>(
      previousResult.rows[0]?.tips,
      []
    );
    if (tips.length === 0) {
      return;
    }

    const weakSet = new Set(params.currentWeakWords);
    for (const tip of tips) {
      const word = typeof tip.word === "string" ? tip.word : "";
      if (!word) {
        continue;
      }
      const tipKey =
        typeof tip.tipKey === "string" && tip.tipKey
          ? tip.tipKey
          : buildTipKey(word, typeof tip.reason === "string" ? tip.reason : "general-coaching");
      const improved = weakSet.has(word) ? 0 : 1;

      await this.pool.query(
        `
          INSERT INTO learning_tip_effectiveness (
            tip_key,
            shown_count,
            improved_count,
            success_score,
            updated_at
          )
          VALUES ($1, 1, $2, $3, NOW())
          ON CONFLICT (tip_key)
          DO UPDATE SET
            shown_count = learning_tip_effectiveness.shown_count + 1,
            improved_count = learning_tip_effectiveness.improved_count + EXCLUDED.improved_count,
            success_score = (
              (learning_tip_effectiveness.improved_count + EXCLUDED.improved_count)::float
              / NULLIF((learning_tip_effectiveness.shown_count + 1), 0)
            ),
            updated_at = NOW()
        `,
        [tipKey, improved, improved]
      );
    }
  }

  async ingestSession(input: SessionIngestInput): Promise<LearningIngestResult> {
    await this.ensureTables();

    const existing = await this.pool.query(
      `
        SELECT id
        FROM learning_session_events
        WHERE user_id = $1 AND session_id = $2
        LIMIT 1
      `,
      [input.userId, input.sessionId]
    );
    if (existing.rows.length > 0) {
      const profile = await this.buildAndPersistProfile(input.userId);
      const globalModel = await this.fetchGlobalModel(50);
      return {
        userId: input.userId,
        deduplicated: true,
        profile,
        recommendations: buildLearningRecommendations({
          profile,
          globalWords: globalModel.words,
          globalTips: globalModel.tips,
        }),
      };
    }

    const features = deriveSessionWordFeatures({
      lyrics: input.lyrics,
      transcript: input.transcript,
      topToFix: input.insights.topToFix,
    });
    const createdAt = normalizeTimestamp(input.createdAt);

    const event: NormalizedSessionLearningEvent = {
      id: randomUUID(),
      userId: input.userId,
      sessionId: input.sessionId,
      songId: input.songId,
      genre: input.genre,
      title: input.title,
      createdAt,
      durationSeconds: input.durationSeconds,
      textAccuracy: input.insights.textAccuracy,
      pronunciationClarity: input.insights.pronunciationClarity,
      timingConsistency: input.insights.timingConsistency,
      transcript: input.transcript,
      expectedWordCount: features.expectedWords.length,
      spokenWordCount: features.spokenWords.length,
      matchedWordCount: features.matchedWords.length,
      weakWords: features.weakWords,
      strongWords: features.strongWords,
      weakSounds: features.weakSounds,
      tips: features.tips,
    };

    await this.pool.query(
      `
        INSERT INTO learning_session_events (
          id,
          user_id,
          session_id,
          song_id,
          genre,
          title,
          created_at,
          duration_seconds,
          text_accuracy,
          pronunciation_clarity,
          timing_consistency,
          transcript,
          expected_word_count,
          spoken_word_count,
          matched_word_count,
          weak_words,
          strong_words,
          weak_sounds,
          tips,
          raw_payload
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7::timestamptz,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16::jsonb,
          $17::jsonb,
          $18::jsonb,
          $19::jsonb,
          $20::jsonb
        )
      `,
      [
        event.id,
        event.userId,
        event.sessionId,
        event.songId ?? null,
        event.genre ?? null,
        event.title ?? null,
        event.createdAt,
        event.durationSeconds,
        event.textAccuracy,
        event.pronunciationClarity,
        event.timingConsistency,
        event.transcript ?? null,
        event.expectedWordCount,
        event.spokenWordCount,
        event.matchedWordCount,
        JSON.stringify(event.weakWords),
        JSON.stringify(event.strongWords),
        JSON.stringify(event.weakSounds),
        JSON.stringify(event.tips),
        JSON.stringify(input),
      ]
    );

    await this.updateGlobalWordDifficulty({
      expectedWords: features.expectedWords,
      weakWords: event.weakWords,
      strongWords: event.strongWords,
    });
    await this.updateTipEffectivenessFromPreviousSession({
      userId: event.userId,
      currentWeakWords: event.weakWords,
      currentCreatedAt: event.createdAt,
    });

    const profile = await this.buildAndPersistProfile(event.userId);
    const globalModel = await this.fetchGlobalModel(50);
    return {
      userId: event.userId,
      deduplicated: false,
      profile,
      recommendations: buildLearningRecommendations({
        profile,
        globalWords: globalModel.words,
        globalTips: globalModel.tips,
      }),
    };
  }

  async ingestEasePocket(input: EasePocketIngestInput): Promise<LearningIngestResult> {
    await this.ensureTables();

    const existing = await this.pool.query(
      `
        SELECT id
        FROM learning_easepocket_events
        WHERE user_id = $1 AND event_id = $2
        LIMIT 1
      `,
      [input.userId, input.eventId]
    );
    if (existing.rows.length > 0) {
      const profile = await this.buildAndPersistProfile(input.userId);
      const globalModel = await this.fetchGlobalModel(50);
      return {
        userId: input.userId,
        deduplicated: true,
        profile,
        recommendations: buildLearningRecommendations({
          profile,
          globalWords: globalModel.words,
          globalTips: globalModel.tips,
        }),
      };
    }

    const event: NormalizedEasePocketLearningEvent = {
      id: randomUUID(),
      userId: input.userId,
      eventId: input.eventId,
      mode: input.mode,
      bpm: input.bpm,
      grid: input.grid,
      beatsPerBar: input.beatsPerBar,
      eventCount: input.stats.eventCount,
      onTimePct: input.stats.onTimePct,
      meanAbsMs: input.stats.meanAbsMs,
      stdDevMs: input.stats.stdDevMs,
      avgOffsetMs: input.stats.avgOffsetMs,
      createdAt: normalizeTimestamp(input.createdAt),
    };

    await this.pool.query(
      `
        INSERT INTO learning_easepocket_events (
          id,
          user_id,
          event_id,
          mode,
          bpm,
          grid,
          beats_per_bar,
          event_count,
          on_time_pct,
          mean_abs_ms,
          std_dev_ms,
          avg_offset_ms,
          created_at,
          raw_payload
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13::timestamptz,
          $14::jsonb
        )
      `,
      [
        event.id,
        event.userId,
        event.eventId,
        event.mode,
        event.bpm,
        event.grid,
        event.beatsPerBar,
        event.eventCount,
        event.onTimePct,
        event.meanAbsMs,
        event.stdDevMs,
        event.avgOffsetMs,
        event.createdAt,
        JSON.stringify(input),
      ]
    );

    const profile = await this.buildAndPersistProfile(event.userId);
    const globalModel = await this.fetchGlobalModel(50);
    return {
      userId: event.userId,
      deduplicated: false,
      profile,
      recommendations: buildLearningRecommendations({
        profile,
        globalWords: globalModel.words,
        globalTips: globalModel.tips,
      }),
    };
  }

  async getUserProfile(userId: string): Promise<UserLearningProfile | null> {
    await this.ensureTables();
    const row = await this.pool.query(
      `
        SELECT *
        FROM learning_user_profiles
        WHERE user_id = $1
        LIMIT 1
      `,
      [userId]
    );
    if (row.rows.length === 0) {
      const sessions = await this.fetchUserSessions(userId);
      const easePocketEvents = await this.fetchUserEasePocketEvents(userId);
      if (sessions.length === 0 && easePocketEvents.length === 0) {
        return null;
      }
      return this.buildAndPersistProfile(userId);
    }

    const profileRow = row.rows[0];
    const fallback = buildDefaultProfile(userId);
    const trendSummary = parseJsonValue(profileRow.trend_summary, fallback.trendSummary);
    const timingSummary = parseJsonValue(profileRow.timing_summary, fallback.timingSummary);

    return {
      userId: String(profileRow.user_id),
      sessionCount: Number(profileRow.session_count),
      easePocketEventCount: Number(profileRow.easepocket_event_count),
      weakWords: parseJsonValue(profileRow.weak_words, fallback.weakWords),
      strongWords: parseJsonValue(profileRow.strong_words, fallback.strongWords),
      weakSounds: parseJsonValue(profileRow.weak_sounds, fallback.weakSounds),
      genreSummary: parseJsonValue(profileRow.genre_summary, fallback.genreSummary),
      trendSummary: {
        recentAvgAccuracy: Number(trendSummary.recentAvgAccuracy || 0),
        baselineAvgAccuracy: Number(trendSummary.baselineAvgAccuracy || 0),
        deltaAccuracy: Number(trendSummary.deltaAccuracy || 0),
        recentAvgClarity: Number(trendSummary.recentAvgClarity || 0),
        timingHighRate: Number(trendSummary.timingHighRate || 0),
      },
      tipSummary: parseJsonValue(profileRow.tip_summary, fallback.tipSummary),
      timingSummary: {
        sessionTimingConsistency: {
          low: Number(timingSummary.sessionTimingConsistency?.low || 0),
          medium: Number(timingSummary.sessionTimingConsistency?.medium || 0),
          high: Number(timingSummary.sessionTimingConsistency?.high || 0),
        },
        easePocketModes: Array.isArray(timingSummary.easePocketModes)
          ? timingSummary.easePocketModes
          : [],
      },
      updatedAt: new Date(profileRow.updated_at || new Date()).toISOString(),
    };
  }

  async getRecommendations(userId: string): Promise<LearningRecommendations | null> {
    const profile = await this.getUserProfile(userId);
    if (!profile) {
      return null;
    }
    const globalModel = await this.fetchGlobalModel(50);
    return buildLearningRecommendations({
      profile,
      globalWords: globalModel.words,
      globalTips: globalModel.tips,
    });
  }

  async getGlobalModel(limit = 20): Promise<LearningGlobalModel> {
    return this.fetchGlobalModel(limit);
  }
}

export function createLearningStore(pool: Pool | null): LearningStore {
  if (!pool) {
    return new MemoryLearningStore();
  }
  return new PostgresLearningStore(pool);
}

export function resolveLearningUserId(params: {
  bodyUserId?: string;
  headerUserId?: string;
  queryUserId?: string;
  fallbackKey: string;
}): string {
  const candidate = params.bodyUserId || params.headerUserId || params.queryUserId;
  const normalized = (candidate || "").trim();
  if (normalized) {
    return normalized.slice(0, 120);
  }
  return `anon:${params.fallbackKey.slice(0, 120)}`;
}

export function normalizeLearningSessionInput(input: SessionIngestInput): SessionIngestInput {
  return {
    ...input,
    createdAt: normalizeTimestamp(input.createdAt),
    durationSeconds: Math.max(1, Math.round(input.durationSeconds)),
    insights: {
      ...input.insights,
      textAccuracy: Math.max(0, Math.min(100, Math.round(input.insights.textAccuracy))),
      pronunciationClarity: Math.max(
        0,
        Math.min(100, Math.round(input.insights.pronunciationClarity))
      ),
      topToFix: input.insights.topToFix.slice(0, 8),
    },
  };
}

export function normalizeLearningEasePocketInput(
  input: EasePocketIngestInput
): EasePocketIngestInput {
  return {
    ...input,
    createdAt: normalizeTimestamp(input.createdAt),
    bpm: Math.max(40, Math.min(300, Math.round(input.bpm))),
    stats: {
      eventCount: Math.max(0, Math.round(input.stats.eventCount)),
      onTimePct: Math.max(0, Math.min(100, Number(input.stats.onTimePct.toFixed(3)))),
      meanAbsMs: Math.max(0, Number(input.stats.meanAbsMs.toFixed(3))),
      stdDevMs: Math.max(0, Number(input.stats.stdDevMs.toFixed(3))),
      avgOffsetMs: Number(input.stats.avgOffsetMs.toFixed(3)),
    },
  };
}

export function defaultLearningIngestResult(userId: string): LearningIngestResult {
  const profile = buildDefaultProfile(userId);
  return {
    userId,
    deduplicated: false,
    profile,
    recommendations: {
      userId,
      focusWords: [],
      globalChallengeWords: [],
      suggestedTips: [],
      practicePlan: [],
    },
  };
}
