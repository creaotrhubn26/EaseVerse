/** The same checksum-aware transport is used by browser files and native Expo files. */
export type SoundRoomTakeUpload = {
  blob: Blob;
  filename: string;
  contentType: string;
  token: string | null;
  externalTrackId?: string;
  sourcePath?: string;
  projectId?: string;
  lyricsSnapshot?: string;
  liveSessionId?: string;
  target?: {
    purpose: "memo" | "comp";
    parentTakeId?: string;
    compId?: string;
    durationSec?: number;
  };
};
type UploadDeps = {
  checksum: (blob: Blob) => Promise<string>;
  request: (path: string, init: RequestInit) => Promise<Response>;
  put: (url: string, init: RequestInit) => Promise<Response>;
};
export async function uploadSoundRoomTake(
  args: SoundRoomTakeUpload,
  deps: UploadDeps,
): Promise<{ url: string; pathname: string }> {
  if (!args.projectId && !args.target)
    throw new Error(
      "Choose a Sound Room project before sharing this recording.",
    );
  const rawType = args.contentType.split(";")[0].trim().toLowerCase();
  const contentType = rawType === "audio/m4a" ? "audio/mp4" : rawType;
  const checksumSha256 = await deps.checksum(args.blob);
  const initRes = await deps.request(
    args.target ? "/api/takes/asset-upload" : "/api/takes/upload",
    {
      method: "POST",
      body: JSON.stringify({
        ...args.target,
        filename: args.filename,
        contentType,
        projectId: args.projectId ?? null,
        byteSize: args.blob.size,
        checksumSha256,
      }),
    },
  );
  if (!initRes.ok) {
    const problem = (await initRes.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      problem.error ||
        "Could not start the upload. Your recording has been kept.",
    );
  }
  const ticket = (await initRes.json()) as {
    takeId: string;
    projectId?: string;
    key: string;
    strategy: "single" | "multipart";
    uploadUrl?: string;
    requiredHeaders?: Record<string, string>;
    partSize?: number;
    partCount?: number;
  };
  const { takeId, key } = ticket;
  const projectId = args.projectId || ticket.projectId;
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      takeId,
    ) ||
    !["single", "multipart"].includes(ticket.strategy)
  )
    throw new Error("Invalid upload ticket");
  const uploadUrl = (value: string | undefined) => {
    if (!value || new URL(value).protocol !== "https:")
      throw new Error("Invalid upload destination");
    return value;
  };
  const completedParts: Array<{
    partNumber: number;
    etag: string;
    checksumSha256: string;
  }> = [];
  if (ticket.strategy === "multipart") {
    if (
      !Number.isSafeInteger(ticket.partSize) ||
      !Number.isSafeInteger(ticket.partCount) ||
      !ticket.partSize ||
      !ticket.partCount ||
      ticket.partSize <= 0 ||
      ticket.partCount !== Math.ceil(args.blob.size / ticket.partSize)
    )
      throw new Error("Invalid upload ticket. Your recording has been kept.");
    for (let partNumber = 1; partNumber <= ticket.partCount; partNumber++) {
      const part = args.blob.slice(
        (partNumber - 1) * ticket.partSize,
        partNumber * ticket.partSize,
      );
      const partChecksum = await deps.checksum(part);
      const partResponse = await deps.request("/api/takes/upload-parts", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          takeId,
          parts: [{ partNumber, checksumSha256: partChecksum }],
        }),
      });
      if (!partResponse.ok)
        throw new Error(
          "Could not continue the upload. Your recording has been kept.",
        );
      const signed = (await partResponse.json()) as {
        parts: Array<{
          uploadUrl: string;
          requiredHeaders: Record<string, string>;
        }>;
      };
      const upload = signed.parts[0];
      const result = await deps.put(uploadUrl(upload?.uploadUrl), {
        method: "PUT",
        headers: upload.requiredHeaders,
        body: part,
      });
      const etag = result.headers.get("etag");
      if (!result.ok || !etag)
        throw new Error("Upload interrupted. Your recording has been kept.");
      completedParts.push({ partNumber, etag, checksumSha256: partChecksum });
    }
  } else {
    if (!ticket.uploadUrl) throw new Error("Invalid upload ticket");
    const headers = new Headers(ticket.requiredHeaders);
    if (!headers.has("content-type")) headers.set("content-type", contentType);
    const result = await deps.put(uploadUrl(ticket.uploadUrl), {
      method: "PUT",
      headers,
      body: args.blob,
    });
    if (!result.ok)
      throw new Error("Upload interrupted. Your recording has been kept.");
  }

  const finRes = await deps.request(
    args.target ? "/api/takes/asset-upload" : "/api/takes/finalize",
    {
      method: "POST",
      body: JSON.stringify({
        ...args.target,
        action: args.target ? "finalize" : undefined,
        takeId,
        parts: completedParts.length ? completedParts : undefined,
        filename: args.filename,
        externalTrackId: args.externalTrackId ?? null,
        sourcePath: args.sourcePath ?? null,
        projectId: args.projectId ?? null,
        lyricsSnapshot: args.lyricsSnapshot ?? null,
        liveSessionId: args.liveSessionId ?? null,
        byteSize: args.blob.size,
      }),
    },
  );
  if (!finRes.ok) throw new Error(`Finalize failed: ${finRes.status}`);
  const data = (await finRes.json()) as { take?: { storageUrl?: string } };
  if (!data?.take?.storageUrl)
    throw new Error(
      "Upload completed but the take could not be opened. Try again.",
    );
  return { url: data.take.storageUrl, pathname: key };
}
