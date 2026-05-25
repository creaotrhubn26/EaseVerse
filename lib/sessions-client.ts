import { authedFetch } from "./authed-fetch";
import { getApiUrl } from "./query-client";

export type LiveSession = {
  id: string;
  projectId: string;
  externalTrackId: string | null;
  startedByUserId: string;
  startedAt: string;
  endedAt: string | null;
  status: "active" | "ended";
  bpm: number | null;
  recordingArmedAt: string | null;
  recordingStartsAt: string | null;
  recordingStoppedAt: string | null;
  clickOn: boolean;
};

export type LiveParticipant = {
  sessionId: string;
  userId: string;
  displayName: string | null;
  projectRole: string | null;
  joinedAt: string;
  lastHeartbeatAt: string;
  micArmed: boolean;
  recording: boolean;
  isOnline: boolean;
  levelDb: number | null;
  peakDb: number | null;
  waveformPeaks: number[] | null;
  levelUpdatedAt: string | null;
};

export async function getActiveSession(
  token: string | null,
  projectId: string,
): Promise<LiveSession | null> {
  const res = await authedFetch(
    `/api/sessions?projectId=${encodeURIComponent(projectId)}`,
    token,
    { method: "GET" },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { session: LiveSession | null };
  return json.session;
}

export async function startSession(
  token: string | null,
  args: { projectId: string; externalTrackId?: string },
): Promise<LiveSession> {
  const res = await authedFetch(`/api/sessions`, token, {
    method: "POST",
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`Start session failed: ${res.status}`);
  const json = (await res.json()) as { session: LiveSession };
  return json.session;
}

export async function endSession(token: string | null, sessionId: string): Promise<void> {
  const res = await authedFetch(`/api/sessions?id=${encodeURIComponent(sessionId)}`, token, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`End session failed: ${res.status}`);
}

export async function joinSession(token: string | null, sessionId: string): Promise<void> {
  const res = await authedFetch(`/api/sessions/join?id=${encodeURIComponent(sessionId)}`, token, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Join session failed: ${res.status}`);
}

export async function sendHeartbeat(
  token: string | null,
  sessionId: string,
  state?: { micArmed?: boolean; recording?: boolean },
): Promise<void> {
  const res = await authedFetch(`/api/sessions/join?id=${encodeURIComponent(sessionId)}`, token, {
    method: "PATCH",
    body: JSON.stringify(state ?? {}),
  });
  if (!res.ok) throw new Error(`Heartbeat failed: ${res.status}`);
}

export async function leaveSession(token: string | null, sessionId: string): Promise<void> {
  const res = await authedFetch(`/api/sessions/join?id=${encodeURIComponent(sessionId)}`, token, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Leave session failed: ${res.status}`);
}

export async function armSession(
  token: string | null,
  sessionId: string,
  args: { countdownSec?: number; bpm?: number; clickOn?: boolean },
): Promise<LiveSession> {
  const res = await authedFetch(`/api/sessions/arm?id=${encodeURIComponent(sessionId)}`, token, {
    method: "POST",
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`Arm failed: ${res.status}`);
  const json = (await res.json()) as { session: LiveSession };
  return json.session;
}

export async function stopSession(token: string | null, sessionId: string): Promise<LiveSession> {
  const res = await authedFetch(`/api/sessions/arm?id=${encodeURIComponent(sessionId)}`, token, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Stop failed: ${res.status}`);
  const json = (await res.json()) as { session: LiveSession };
  return json.session;
}

export async function updateBpm(
  token: string | null,
  sessionId: string,
  bpm: number,
  clickOn?: boolean,
): Promise<void> {
  const res = await authedFetch(`/api/sessions/arm?id=${encodeURIComponent(sessionId)}`, token, {
    method: "PATCH",
    body: JSON.stringify({ bpm, clickOn }),
  });
  if (!res.ok) throw new Error(`BPM update failed: ${res.status}`);
}

export function sessionStreamUrl(sessionId: string): string {
  return `${getApiUrl()}/api/sessions/stream?id=${encodeURIComponent(sessionId)}`;
}

export type LiveSessionTake = {
  takeId: string;
  userId: string;
  displayName: string | null;
  projectRole: string | null;
  storageUrl: string;
  filename: string;
  durationSec: number | null;
  uploadedAt: string;
  offsetSec: number;
  status: "queued" | "processing" | "done" | "error";
};

export type LiveSessionTakesResponse = {
  session: {
    id: string;
    externalTrackId: string | null;
    bpm: number | null;
    recordingStartsAt: string | null;
    recordingStoppedAt: string | null;
    endedAt: string | null;
    startedAt: string;
  };
  takes: LiveSessionTake[];
};

export type MixdownStatus = {
  status: "queued" | "processing" | "done" | "error" | null;
  url: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
};

export async function fetchMixdownStatus(
  token: string | null,
  sessionId: string,
): Promise<MixdownStatus> {
  const res = await authedFetch(
    `/api/sessions/mixdown?id=${encodeURIComponent(sessionId)}`,
    token,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(`Mixdown status failed: ${res.status}`);
  return (await res.json()) as MixdownStatus;
}

export async function startMixdown(
  token: string | null,
  sessionId: string,
): Promise<void> {
  const res = await authedFetch(
    `/api/sessions/mixdown?id=${encodeURIComponent(sessionId)}`,
    token,
    { method: "POST" },
  );
  if (!res.ok && res.status !== 202 && res.status !== 409) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Mixdown start failed: ${res.status}`);
  }
}

export type DebriefSection = {
  label: string;
  type: string;
  startSec: number;
  endSec: number;
  winnerTakeId: string | null;
  runnerUpTakeId: string | null;
  notes: string;
};

export type Debrief = {
  sessionId: string;
  status: "processing" | "done" | "error";
  sections: DebriefSection[] | null;
  overallNotes: string | null;
  generatedAt: string | null;
  errorMessage: string | null;
  startedAt: string;
};

export async function fetchDebrief(
  token: string | null,
  sessionId: string,
): Promise<Debrief | null> {
  const res = await authedFetch(
    `/api/sessions/debrief?id=${encodeURIComponent(sessionId)}`,
    token,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(`Debrief fetch failed: ${res.status}`);
  const json = (await res.json()) as { debrief: Debrief | null };
  return json.debrief;
}

export async function startDebrief(
  token: string | null,
  sessionId: string,
): Promise<void> {
  const res = await authedFetch(
    `/api/sessions/debrief?id=${encodeURIComponent(sessionId)}`,
    token,
    { method: "POST" },
  );
  if (!res.ok && res.status !== 202 && res.status !== 409) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Debrief start failed: ${res.status}`);
  }
}

export async function fetchLiveSessionTakes(
  token: string | null,
  sessionId: string,
): Promise<LiveSessionTakesResponse> {
  const res = await authedFetch(
    `/api/sessions/takes?id=${encodeURIComponent(sessionId)}`,
    token,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(`Session takes fetch failed: ${res.status}`);
  return (await res.json()) as LiveSessionTakesResponse;
}
