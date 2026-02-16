import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Storage from "@/lib/storage";
import { ingestEasePocketLearningEvent, ingestSessionLearningEvent } from "@/lib/learning-client";
import type { Session } from "@/lib/types";

const LEARNING_BACKFILL_STATE_KEY = "@easeverse_learning_backfill_state_v1";
const LEARNING_BACKFILL_VERSION = 1;

type LearningBackfillState = {
  version: number;
  userId: string;
  completedAt: number;
  sessionCount: number;
  easePocketCount: number;
};

function parseBackfillState(raw: string | null): LearningBackfillState | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LearningBackfillState>;
    if (
      parsed.version !== LEARNING_BACKFILL_VERSION ||
      typeof parsed.userId !== "string" ||
      typeof parsed.completedAt !== "number" ||
      typeof parsed.sessionCount !== "number" ||
      typeof parsed.easePocketCount !== "number"
    ) {
      return null;
    }
    return {
      version: parsed.version,
      userId: parsed.userId,
      completedAt: parsed.completedAt,
      sessionCount: parsed.sessionCount,
      easePocketCount: parsed.easePocketCount,
    };
  } catch {
    return null;
  }
}

async function getBackfillState(): Promise<LearningBackfillState | null> {
  const raw = await AsyncStorage.getItem(LEARNING_BACKFILL_STATE_KEY);
  return parseBackfillState(raw);
}

async function saveBackfillState(state: LearningBackfillState): Promise<void> {
  await AsyncStorage.setItem(LEARNING_BACKFILL_STATE_KEY, JSON.stringify(state));
}

function shouldSkipBackfill(params: {
  state: LearningBackfillState | null;
  userId: string;
  sessionCount: number;
  easePocketCount: number;
}): boolean {
  const { state, userId, sessionCount, easePocketCount } = params;
  if (!state) {
    return false;
  }

  if (state.userId !== userId) {
    return false;
  }

  // Keep this as a one-time migration: once the local snapshot is backfilled,
  // ongoing events are sent in real time from Sing and EasePocket flows.
  return (
    state.version === LEARNING_BACKFILL_VERSION &&
    state.sessionCount >= sessionCount &&
    state.easePocketCount >= easePocketCount
  );
}

export async function runLearningBackfill(params: {
  sessions: Session[];
}): Promise<{ skipped: boolean; syncedSessions: number; syncedEasePocket: number }> {
  const userId = await Storage.getOrCreateLearningUserId();
  const [existingState, easePocketHistory] = await Promise.all([
    getBackfillState(),
    Storage.getEasePocketHistory(),
  ]);

  if (
    shouldSkipBackfill({
      state: existingState,
      userId,
      sessionCount: params.sessions.length,
      easePocketCount: easePocketHistory.length,
    })
  ) {
    return { skipped: true, syncedSessions: 0, syncedEasePocket: 0 };
  }

  let syncedSessions = 0;
  let syncedEasePocket = 0;
  let hasFailures = false;

  const orderedSessions = [...params.sessions].sort((a, b) => a.date - b.date);
  for (const session of orderedSessions) {
    const result = await ingestSessionLearningEvent({ session });
    if (result) {
      syncedSessions += 1;
    } else {
      hasFailures = true;
    }
  }

  const orderedEasePocket = [...easePocketHistory].sort(
    (a, b) => a.createdAt - b.createdAt
  );
  for (const item of orderedEasePocket) {
    const result = await ingestEasePocketLearningEvent({ item });
    if (result) {
      syncedEasePocket += 1;
    } else {
      hasFailures = true;
    }
  }

  if (!hasFailures) {
    await saveBackfillState({
      version: LEARNING_BACKFILL_VERSION,
      userId,
      completedAt: Date.now(),
      sessionCount: params.sessions.length,
      easePocketCount: easePocketHistory.length,
    });
  }

  return {
    skipped: false,
    syncedSessions,
    syncedEasePocket,
  };
}

