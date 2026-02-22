import { getApiHeaders, getApiUrl } from "@/lib/query-client";
import * as Storage from "@/lib/storage";
import type { Session } from "@/lib/types";

type LearningIngestResponse = {
  ok: boolean;
  userId: string;
  deduplicated: boolean;
};

const isLearningDisabled = () => {
  const runtime = (globalThis as { __E2E_DISABLE_LEARNING__?: boolean }).__E2E_DISABLE_LEARNING__;
  if (runtime) return true;
  const envFlag = process.env.EXPO_PUBLIC_DISABLE_LEARNING;
  return envFlag === "true" || envFlag === "1";
};

const loggedLearningNetworkWarnings = new Set<string>();
const LEARNING_NETWORK_BACKOFF_MS = 30_000;
let learningNetworkBackoffUntil = 0;

function isFetchNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "AbortError") {
    return false;
  }
  // Browser fetch uses TypeError for connection/CORS/offline failures.
  return error.name === "TypeError" || /failed to fetch/i.test(error.message);
}

function warnLearningNetworkOnce(scope: string, error: unknown) {
  if (loggedLearningNetworkWarnings.has(scope)) {
    return;
  }
  loggedLearningNetworkWarnings.add(scope);
  console.warn(`${scope} is unavailable. Check API server/CORS at ${getApiUrl()}`, error);
}

function shouldSkipLearningRequestDuringBackoff(): boolean {
  return Date.now() < learningNetworkBackoffUntil;
}

function markLearningNetworkFailure(scope: string, error: unknown) {
  learningNetworkBackoffUntil = Date.now() + LEARNING_NETWORK_BACKOFF_MS;
  warnLearningNetworkOnce(scope, error);
}

async function readJsonIfPresent<T>(response: Response, context: string): Promise<T | null> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    const text = (await response.text()).trim();
    const preview = text.slice(0, 120).replace(/\s+/g, " ");
    console.warn(`${context}: expected JSON but received ${contentType || "unknown"} (${preview})`);
    return null;
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    console.warn(`${context}: invalid JSON response`, error);
    return null;
  }
}

export async function ingestSessionLearningEvent(params: {
  session: Session;
}): Promise<LearningIngestResponse | null> {
  const { session } = params;
  if (!session.id || !session.lyrics.trim()) {
    return null;
  }

  if (isLearningDisabled()) {
    return null;
  }
  if (shouldSkipLearningRequestDuringBackoff()) {
    return null;
  }

  try {
    const userId = await Storage.getOrCreateLearningUserId();
    const url = new URL("/api/v1/learning/session", getApiUrl());
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: getApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        userId,
        sessionId: session.id,
        songId: session.songId,
        genre: session.genre,
        title: session.title,
        createdAt: new Date(session.date).toISOString(),
        durationSeconds: session.duration,
        lyrics: session.lyrics,
        transcript: session.transcript || "",
        insights: session.insights,
      }),
    });

    if (!response.ok) {
      return null;
    }
    learningNetworkBackoffUntil = 0;
    return await readJsonIfPresent<LearningIngestResponse>(response, "Learning session ingest");
  } catch (error) {
    if (isFetchNetworkError(error)) {
      markLearningNetworkFailure("Learning session ingest", error);
      return null;
    }
    console.error("Learning session ingest request failed:", error);
    return null;
  }
}

export async function ingestEasePocketLearningEvent(params: {
  item: Storage.EasePocketHistoryItem;
}): Promise<LearningIngestResponse | null> {
  const { item } = params;
  if (!item.id) {
    return null;
  }

  if (isLearningDisabled()) {
    return null;
  }
  if (shouldSkipLearningRequestDuringBackoff()) {
    return null;
  }

  try {
    const userId = await Storage.getOrCreateLearningUserId();
    const url = new URL("/api/v1/learning/easepocket", getApiUrl());
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: getApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        userId,
        eventId: item.id,
        mode: item.mode,
        bpm: item.bpm,
        grid: item.grid,
        beatsPerBar: item.beatsPerBar,
        createdAt: new Date(item.createdAt).toISOString(),
        stats: item.stats,
      }),
    });

    if (!response.ok) {
      return null;
    }
    learningNetworkBackoffUntil = 0;
    return await readJsonIfPresent<LearningIngestResponse>(response, "Learning EasePocket ingest");
  } catch (error) {
    if (isFetchNetworkError(error)) {
      markLearningNetworkFailure("Learning EasePocket ingest", error);
      return null;
    }
    console.error("Learning EasePocket ingest request failed:", error);
    return null;
  }
}

export async function fetchLearningRecommendations(): Promise<unknown | null> {
  if (isLearningDisabled()) {
    return null;
  }
  if (shouldSkipLearningRequestDuringBackoff()) {
    return null;
  }
  try {
    const userId = await Storage.getOrCreateLearningUserId();
    const url = new URL("/api/v1/learning/recommendations", getApiUrl());
    url.searchParams.set("userId", userId);
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: getApiHeaders(),
    });
    if (!response.ok) {
      return null;
    }
    learningNetworkBackoffUntil = 0;
    return await readJsonIfPresent<unknown>(response, "Learning recommendations request");
  } catch (error) {
    if (isFetchNetworkError(error)) {
      markLearningNetworkFailure("Learning recommendations", error);
      return null;
    }
    console.error("Learning recommendations request failed:", error);
    return null;
  }
}
