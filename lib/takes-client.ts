// All take-lagring (takes, produsent-memo, comp-eksport) går nå til Backblaze B2
// via presignerte URL-er — ingen Vercel Blob / Web Crypto (RN-trygt).
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

// Backblaze B2-opplasting i to steg (RN-trygt — ingen @vercel/blob / Web Crypto):
//  1) be backend om en presignert PUT-URL,  2) PUT fila direkte til B2,
//  3) finaliser (oppretter take-rad + starter prosessering).
async function uploadTakeToB2(args: {
  blob: Blob;
  filename: string;
  contentType: string;
  token: string;
  externalTrackId?: string;
  sourcePath?: string;
  projectId?: string;
  lyricsSnapshot?: string;
  liveSessionId?: string;
}): Promise<{ url: string; pathname: string }> {
  const initRes = await authedFetch("/api/takes/upload", args.token, {
    method: "POST",
    body: JSON.stringify({
      filename: args.filename,
      contentType: args.contentType,
      projectId: args.projectId ?? null,
      byteSize: args.blob.size,
    }),
  });
  if (!initRes.ok) throw new Error(`Upload init failed: ${initRes.status}`);
  const { takeId, uploadUrl, key } = (await initRes.json()) as {
    takeId: string;
    uploadUrl: string;
    key: string;
  };

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": args.contentType },
    body: args.blob,
  });
  if (!putRes.ok) throw new Error(`B2 upload failed: ${putRes.status}`);

  const finRes = await authedFetch("/api/takes/finalize", args.token, {
    method: "POST",
    body: JSON.stringify({
      takeId,
      filename: args.filename,
      externalTrackId: args.externalTrackId ?? null,
      sourcePath: args.sourcePath ?? null,
      projectId: args.projectId ?? null,
      lyricsSnapshot: args.lyricsSnapshot ?? null,
      liveSessionId: args.liveSessionId ?? null,
      byteSize: args.blob.size,
    }),
  });
  if (!finRes.ok) throw new Error(`Finalize failed: ${finRes.status}`);
  const data = (await finRes.json()) as { take?: { storageUrl?: string } };
  return { url: data?.take?.storageUrl ?? "", pathname: key };
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
  return uploadTakeToB2({
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
// it directly to B2 via the presigned URL.
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
  const contentType = blob.type && blob.type !== "" ? blob.type : args.contentType || "audio/m4a";
  const typed = blob.type ? blob : new Blob([blob], { type: contentType });
  return uploadTakeToB2({
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
  const contentType = args.blob.type || "audio/webm";
  const initRes = await authedFetch("/api/takes/memo-upload", args.token, {
    method: "POST",
    body: JSON.stringify({ takeId: args.takeId, contentType }),
  });
  if (!initRes.ok) throw new Error(`Memo init failed: ${initRes.status}`);
  const { uploadUrl, key } = (await initRes.json()) as { uploadUrl: string; key: string };
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: args.blob,
  });
  if (!putRes.ok) throw new Error(`Memo upload failed: ${putRes.status}`);
  const finRes = await authedFetch("/api/takes/memo-upload", args.token, {
    method: "POST",
    body: JSON.stringify({ takeId: args.takeId, action: "finalize", durationSec: args.durationSec }),
  });
  if (!finRes.ok) throw new Error(`Memo finalize failed: ${finRes.status}`);
  const data = (await finRes.json()) as { url?: string };
  return { url: data?.url ?? "", pathname: key };
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
  const initRes = await authedFetch("/api/takes/comp-export", args.token, {
    method: "POST",
    body: JSON.stringify({ compId: args.compId, filename: args.filename }),
  });
  if (!initRes.ok) throw new Error(`Comp export init failed: ${initRes.status}`);
  const { uploadUrl, key } = (await initRes.json()) as { uploadUrl: string; key: string };
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "audio/wav" },
    body: args.blob,
  });
  if (!putRes.ok) throw new Error(`Comp upload failed: ${putRes.status}`);
  const finRes = await authedFetch("/api/takes/comp-export", args.token, {
    method: "POST",
    body: JSON.stringify({ compId: args.compId, filename: args.filename, action: "finalize" }),
  });
  if (!finRes.ok) throw new Error(`Comp finalize failed: ${finRes.status}`);
  return { url: `${getApiUrl()}/api/takes/comp-export?id=${encodeURIComponent(args.compId)}`, pathname: key };
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
