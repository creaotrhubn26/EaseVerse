import { upload } from "@vercel/blob/client";
import { authedFetch } from "./authed-fetch";
import { getApiUrl } from "./query-client";

export type ProducerDecision = "keeper" | "redo" | null;

export type TakeRecord = {
  id: string;
  userId: string;
  externalTrackId: string | null;
  sourcePath: string | null;
  filename: string;
  byteSize: number | null;
  durationSec: number | null;
  storageUrl: string;
  uploadedAt: string;
  status: "queued" | "processing" | "done" | "error";
  errorMessage: string | null;
  producerNote: string | null;
  producerDecision: ProducerDecision;
  producerMemoUrl: string | null;
  producerMemoDurationSec: number | null;
  decisionLockedAt: string | null;
  projectId: string | null;
};

export type ConsensusVote = "agree" | "disagree";

export type ConsensusTally = {
  takeId: string;
  agree: number;
  disagree: number;
  votes: Array<{ userId: string; vote: ConsensusVote; comment: string | null; createdAt: string }>;
  myVote: ConsensusVote | null;
};

export type TakeAnalysis = {
  takeId: string;
  transcript: string | null;
  pitchMeanHz: number | null;
  pitchStddevCents: number | null;
  vibratoRateHz: number | null;
  energyAvgDb: number | null;
  energyStddevDb: number | null;
  timingScore: number | null;
  pronunciationScore: number | null;
  aiNotes: string | null;
  bestTakeInGroup: boolean;
  processedAt: string | null;
};

export async function uploadTake(args: {
  file: File;
  externalTrackId?: string;
  sourcePath?: string;
  token: string;
  projectId?: string;
  lyricsSnapshot?: string;
  liveSessionId?: string;
}): Promise<{ url: string; pathname: string }> {
  const result = await upload(args.file.name, args.file, {
    access: "public",
    handleUploadUrl: `${getApiUrl()}/api/takes/upload`,
    clientPayload: JSON.stringify({
      externalTrackId: args.externalTrackId,
      sourcePath: args.sourcePath,
      filename: args.file.name,
      projectId: args.projectId,
      lyricsSnapshot: args.lyricsSnapshot,
      liveSessionId: args.liveSessionId,
    }),
    headers: { Authorization: `Bearer ${args.token}` },
  });
  return { url: result.url, pathname: result.pathname };
}

// React Native upload — feeds a local file:// URI to Vercel Blob via the
// same handleUpload contract used by the web client. We materialize the
// file as a Blob first so @vercel/blob/client can stream it.
export async function uploadTakeFromUri(args: {
  uri: string;
  filename: string;
  contentType?: string;
  externalTrackId?: string;
  sourcePath?: string;
  token: string;
  projectId?: string;
  lyricsSnapshot?: string;
  liveSessionId?: string;
}): Promise<{ url: string; pathname: string }> {
  const res = await fetch(args.uri);
  const blob = await res.blob();
  const typed =
    blob.type && blob.type !== ""
      ? blob
      : new Blob([blob], { type: args.contentType || "audio/m4a" });
  const result = await upload(args.filename, typed, {
    access: "public",
    handleUploadUrl: `${getApiUrl()}/api/takes/upload`,
    clientPayload: JSON.stringify({
      externalTrackId: args.externalTrackId,
      sourcePath: args.sourcePath,
      filename: args.filename,
      projectId: args.projectId,
      lyricsSnapshot: args.lyricsSnapshot,
      liveSessionId: args.liveSessionId,
    }),
    headers: { Authorization: `Bearer ${args.token}` },
  });
  return { url: result.url, pathname: result.pathname };
}

export async function fetchTakes(token: string | null): Promise<TakeRecord[]> {
  const response = await authedFetch("/api/takes", token, { method: "GET" });
  if (!response.ok) throw new Error(`Takes fetch failed: ${response.status}`);
  const data = (await response.json()) as { takes: TakeRecord[] };
  return data.takes;
}

export async function triggerProcessTake(token: string | null, takeId: string): Promise<void> {
  await authedFetch(`/api/takes/process?id=${encodeURIComponent(takeId)}`, token, {
    method: "POST",
  });
}

export async function uploadProducerMemo(args: {
  takeId: string;
  blob: Blob;
  durationSec: number;
  token: string;
}): Promise<{ url: string; pathname: string }> {
  const filename = `memo-${args.takeId}-${Date.now()}.webm`;
  const result = await upload(filename, args.blob, {
    access: "public",
    handleUploadUrl: `${getApiUrl()}/api/takes/memo-upload`,
    clientPayload: JSON.stringify({
      takeId: args.takeId,
      durationSec: args.durationSec,
    }),
    headers: { Authorization: `Bearer ${args.token}` },
  });
  return { url: result.url, pathname: result.pathname };
}

export async function castVote(
  token: string | null,
  takeId: string,
  vote: ConsensusVote,
  comment?: string,
): Promise<ConsensusTally> {
  const response = await authedFetch(
    `/api/takes/vote?id=${encodeURIComponent(takeId)}`,
    token,
    { method: "POST", body: JSON.stringify({ vote, comment }) },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Vote failed: ${response.status}`);
  }
  return (await response.json()) as ConsensusTally;
}

export async function clearVote(token: string | null, takeId: string): Promise<ConsensusTally> {
  const response = await authedFetch(
    `/api/takes/vote?id=${encodeURIComponent(takeId)}`,
    token,
    { method: "DELETE" },
  );
  if (!response.ok) throw new Error(`Clear vote failed: ${response.status}`);
  return (await response.json()) as ConsensusTally;
}

export async function fetchVoteTally(
  token: string | null,
  takeId: string,
): Promise<ConsensusTally> {
  const response = await authedFetch(
    `/api/takes/vote?id=${encodeURIComponent(takeId)}`,
    token,
    { method: "GET" },
  );
  if (!response.ok) throw new Error(`Tally fetch failed: ${response.status}`);
  return (await response.json()) as ConsensusTally;
}

export type TakeRegion = {
  id: string;
  takeId: string;
  startSec: number;
  endSec: number;
  label: string | null;
  color: string | null;
  autoLoop: boolean;
  createdByUserId: string;
  createdAt: string;
};

export async function listRegions(token: string | null, takeId: string): Promise<TakeRegion[]> {
  const res = await authedFetch(
    `/api/takes/regions?takeId=${encodeURIComponent(takeId)}`,
    token,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(`List regions failed: ${res.status}`);
  const json = (await res.json()) as { regions: TakeRegion[] };
  return json.regions;
}

export async function createRegion(
  token: string | null,
  takeId: string,
  args: { startSec: number; endSec: number; label?: string; autoLoop?: boolean },
): Promise<TakeRegion> {
  const res = await authedFetch(
    `/api/takes/regions?takeId=${encodeURIComponent(takeId)}`,
    token,
    { method: "POST", body: JSON.stringify(args) },
  );
  if (!res.ok) throw new Error(`Create region failed: ${res.status}`);
  const json = (await res.json()) as { region: TakeRegion };
  return json.region;
}

export type CompRecord = {
  id: string;
  projectId: string | null;
  externalTrackId: string | null;
  name: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type CompSegment = {
  id: string;
  compId: string;
  ordinal: number;
  takeId: string;
  startSec: number;
  endSec: number;
  sectionLabel: string | null;
  createdAt: string;
};

export async function listComps(token: string | null, externalTrackId: string): Promise<CompRecord[]> {
  const res = await authedFetch(
    `/api/takes/comps?trackId=${encodeURIComponent(externalTrackId)}`,
    token,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(`List comps failed: ${res.status}`);
  const json = (await res.json()) as { comps: CompRecord[] };
  return json.comps;
}

export async function createComp(
  token: string | null,
  args: { name: string; externalTrackId: string; projectId?: string },
): Promise<CompRecord> {
  const res = await authedFetch(`/api/takes/comps`, token, {
    method: "POST",
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`Create comp failed: ${res.status}`);
  const json = (await res.json()) as { comp: CompRecord };
  return json.comp;
}

export async function getComp(
  token: string | null,
  compId: string,
): Promise<{ comp: CompRecord; segments: CompSegment[] }> {
  const res = await authedFetch(
    `/api/takes/comps?id=${encodeURIComponent(compId)}`,
    token,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(`Get comp failed: ${res.status}`);
  return (await res.json()) as { comp: CompRecord; segments: CompSegment[] };
}

export async function saveCompSegments(
  token: string | null,
  compId: string,
  segments: Array<{ takeId: string; startSec: number; endSec: number; sectionLabel?: string }>,
): Promise<CompSegment[]> {
  const res = await authedFetch(
    `/api/takes/comps?id=${encodeURIComponent(compId)}`,
    token,
    { method: "PUT", body: JSON.stringify({ segments }) },
  );
  if (!res.ok) throw new Error(`Save segments failed: ${res.status}`);
  const json = (await res.json()) as { segments: CompSegment[] };
  return json.segments;
}

export type TakeRanking = {
  trackId: string;
  ranked: Array<{
    takeId: string;
    score: number;
    components: {
      timing: number | null;
      pronunciation: number | null;
      pitchStability: number | null;
      energyConsistency: number | null;
    };
  }>;
  suggestion: { takeId: string; startSec: number; endSec: number; sectionLabel: string } | null;
};

export type DetectedSection = {
  label: string;
  type: string;
  startSec: number;
  endSec: number;
  lyricsFirstWord: string;
};

export async function fetchTakeSections(
  token: string | null,
  takeId: string,
): Promise<{ sections: DetectedSection[]; wordCount: number }> {
  const res = await authedFetch(
    `/api/takes/sections?id=${encodeURIComponent(takeId)}`,
    token,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(`Sections fetch failed: ${res.status}`);
  return (await res.json()) as { sections: DetectedSection[]; wordCount: number };
}

export async function fetchTakeRanking(
  token: string | null,
  externalTrackId: string,
): Promise<TakeRanking> {
  const res = await authedFetch(
    `/api/takes/rank?trackId=${encodeURIComponent(externalTrackId)}`,
    token,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(`Rank fetch failed: ${res.status}`);
  return (await res.json()) as TakeRanking;
}

export async function uploadCompExport(args: {
  compId: string;
  filename: string;
  blob: Blob;
  token: string;
}): Promise<{ url: string; pathname: string }> {
  const result = await upload(args.filename, args.blob, {
    access: "public",
    handleUploadUrl: `${getApiUrl()}/api/takes/comp-export`,
    clientPayload: JSON.stringify({ compId: args.compId, filename: args.filename }),
    headers: { Authorization: `Bearer ${args.token}` },
  });
  return { url: result.url, pathname: result.pathname };
}

export async function deleteComp(token: string | null, compId: string): Promise<void> {
  const res = await authedFetch(
    `/api/takes/comps?id=${encodeURIComponent(compId)}`,
    token,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Delete comp failed: ${res.status}`);
}

export async function deleteRegion(token: string | null, regionId: string): Promise<void> {
  const res = await authedFetch(
    `/api/takes/regions?id=${encodeURIComponent(regionId)}`,
    token,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Delete region failed: ${res.status}`);
}

export async function lockDecision(token: string | null, takeId: string): Promise<TakeRecord> {
  const response = await authedFetch(
    `/api/takes/lock?id=${encodeURIComponent(takeId)}`,
    token,
    { method: "POST" },
  );
  if (!response.ok) throw new Error(`Lock failed: ${response.status}`);
  return (await response.json()) as TakeRecord;
}

export async function unlockDecision(token: string | null, takeId: string): Promise<TakeRecord> {
  const response = await authedFetch(
    `/api/takes/lock?id=${encodeURIComponent(takeId)}`,
    token,
    { method: "DELETE" },
  );
  if (!response.ok) throw new Error(`Unlock failed: ${response.status}`);
  return (await response.json()) as TakeRecord;
}

export async function updateTakeFeedback(
  token: string | null,
  takeId: string,
  patch: { producerNote?: string | null; producerDecision?: ProducerDecision | "clear" },
): Promise<TakeRecord> {
  const response = await authedFetch(
    `/api/takes/feedback?id=${encodeURIComponent(takeId)}`,
    token,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  if (!response.ok) throw new Error(`Feedback update failed: ${response.status}`);
  return (await response.json()) as TakeRecord;
}

export async function fetchTakeDetail(
  token: string | null,
  takeId: string,
): Promise<(TakeRecord & { analysis: TakeAnalysis | null }) | null> {
  const response = await authedFetch(`/api/takes?id=${encodeURIComponent(takeId)}`, token, {
    method: "GET",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Take detail failed: ${response.status}`);
  return (await response.json()) as TakeRecord & { analysis: TakeAnalysis | null };
}
