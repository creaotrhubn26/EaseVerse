import { uploadSoundRoomTake, type SoundRoomTakeUpload } from "./sound-room-upload";
import { File as LocalFile } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import * as Crypto from "expo-crypto";
// New project takes use verified private CreatorHub S3 uploads.
// Existing B2 objects remain readable; new takes, memos and comp exports use S3.
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

// A linked project, checksum and server-issued ticket bind the take to Sound Room.
async function uploadTakeToCreatorHub(args: SoundRoomTakeUpload): Promise<{ url: string; pathname: string }> {
  return uploadSoundRoomTake(args, {
    checksum: async blob => Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await blob.arrayBuffer()))).map(byte => byte.toString(16).padStart(2, '0')).join(''),
    request: (path, init) => authedFetch(path, args.token, init),
    put: (url, init) => expoFetch(url, init),
  });
}

export async function uploadTake(args: {
  file: File;
  externalTrackId?: string;
  sourcePath?: string;
  token: string;
  projectId?: string;
  lyricsSnapshot?: string;
  liveSessionId?: string;
}): Promise<{ url: string; pathname: string }> {
  return uploadTakeToCreatorHub({
    blob: args.file,
    filename: args.file.name,
    contentType: args.file.type || "application/octet-stream",
    token: args.token,
    externalTrackId: args.externalTrackId,
    sourcePath: args.sourcePath,
    projectId: args.projectId,
    lyricsSnapshot: args.lyricsSnapshot,
    liveSessionId: args.liveSessionId,
  });
}

// React Native upload — materialize the local file:// URI as a Blob, then PUT
// it directly to private CreatorHub S3 using the verified upload ticket.
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
  const typed = new LocalFile(args.uri);
  const contentType = args.contentType || typed.type || "audio/m4a";
  return uploadTakeToCreatorHub({
    blob: typed,
    filename: args.filename,
    contentType,
    token: args.token,
    externalTrackId: args.externalTrackId,
    sourcePath: args.sourcePath,
    projectId: args.projectId,
    lyricsSnapshot: args.lyricsSnapshot,
    liveSessionId: args.liveSessionId,
  });
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
  return uploadTakeToCreatorHub({ blob: args.blob, filename: 'Producer memo.webm', contentType: args.blob.type || 'audio/webm', token: args.token, target: { purpose: 'memo', parentTakeId: args.takeId, durationSec: args.durationSec } });
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
  return uploadTakeToCreatorHub({ blob: args.blob, filename: args.filename, contentType: 'audio/wav', token: args.token, target: { purpose: 'comp', compId: args.compId } });
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
