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

export function sessionStreamUrl(sessionId: string): string {
  return `${getApiUrl()}/api/sessions/stream?id=${encodeURIComponent(sessionId)}`;
}
