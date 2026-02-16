import { getApiHeaders, getApiUrl } from "@/lib/query-client";
import * as Storage from "@/lib/storage";
import type { Session } from "@/lib/types";

type LearningIngestResponse = {
  ok: boolean;
  userId: string;
  deduplicated: boolean;
};

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
    return await readJsonIfPresent<LearningIngestResponse>(response, "Learning session ingest");
  } catch (error) {
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
    return await readJsonIfPresent<LearningIngestResponse>(response, "Learning EasePocket ingest");
  } catch (error) {
    console.error("Learning EasePocket ingest request failed:", error);
    return null;
  }
}

export async function fetchLearningRecommendations(): Promise<unknown | null> {
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
    return await readJsonIfPresent<unknown>(response, "Learning recommendations request");
  } catch (error) {
    console.error("Learning recommendations request failed:", error);
    return null;
  }
}
