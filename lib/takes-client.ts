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
}): Promise<{ url: string; pathname: string }> {
  const result = await upload(args.file.name, args.file, {
    access: "public",
    handleUploadUrl: `${getApiUrl()}/api/takes/upload`,
    clientPayload: JSON.stringify({
      externalTrackId: args.externalTrackId,
      sourcePath: args.sourcePath,
      filename: args.file.name,
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
