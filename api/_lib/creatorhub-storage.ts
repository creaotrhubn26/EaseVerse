import { creatorHubApiUrl } from "./auth-upstream.js";
import { getCreatorHubProjectLink } from "./creatorhub-project-links.js";
import { getProjectMembership } from "./projects-db.js";

export class SoundRoomStorageError extends Error {
  constructor(public status: number) {
    super(`CreatorHub storage operation failed (${status})`);
  }
}

export type SoundRoomContext = {
  ownerUserId: string;
  actorUserId: string;
  audioReviewProjectId: string;
  externalTrackId: string;
};
export async function soundRoomContext(
  projectId: string | null,
  userId: string,
  readOnly = false,
): Promise<SoundRoomContext | null> {
  if (!projectId) return null;
  const membership = await getProjectMembership(projectId, userId);
  if (!membership || (!readOnly && membership.role === "observer")) return null;
  const link = await getCreatorHubProjectLink(projectId, userId);
  if (!link?.audioReviewProjectId || !link.externalTrackId) return null;
  return {
    ownerUserId: link.ownerUserId,
    actorUserId: userId,
    audioReviewProjectId: link.audioReviewProjectId,
    externalTrackId: link.externalTrackId,
  };
}

/** The mobile app receives a short-lived upload ticket, never S3 or service credentials. */
export async function soundRoomStorage(
  operation: string,
  context: SoundRoomContext,
  input: Record<string, unknown> = {},
  options: { apiUrl?: string; apiKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<Record<string, any>> {
  if (
    !/^(initiate|reviews|collaboration|collaboration-files|warmups|warmup-complete|studio-overview|studio-upgrade-request|music-identity|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/(parts|resume|complete|playback|review))$/i.test(
      operation,
    )
  )
    throw new Error("invalid_storage_operation");
  const base = (options.apiUrl ?? creatorHubApiUrl() ?? "").replace(/\/+$/, "");
  const key = (options.apiKey ?? process.env.EXTERNAL_API_KEY ?? "").trim();
  if (!base || !key)
    throw new Error("CreatorHub storage connection is unavailable");
  const destination = new URL(base);
  if (
    destination.protocol !== "https:" &&
    !(
      destination.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(destination.hostname)
    )
  )
    throw new Error("Invalid CreatorHub storage destination");
  const response = await (options.fetchImpl ?? fetch)(
    `${base}/api/integrations/easeverse/storage/${operation}`,
    {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify({ ...input, ...context }),
    },
  );
  if (!response.ok) throw new SoundRoomStorageError(response.status);
  return (await response.json()) as Record<string, any>;
}
