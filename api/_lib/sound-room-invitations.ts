import { creatorHubApiUrl } from "./auth-upstream.js";
export type InvitationContext = {
  memberId: string;
  ownerUserId: string;
  audioReviewProjectId: string;
  externalTrackId: string | null;
  projectTitle: string;
  easeverseAccess: boolean;
  profile: {
    name: string;
    role: string;
    instrument: string;
    email: string;
    phone: string;
    bio: string;
    avatarUrl: string;
    links: Record<string, string>;
    contributions: string[];
    completed: boolean;
  };
};
export class InvitationError extends Error {
  constructor(public status: number) {
    super("invitation_request_failed");
  }
}
export async function requestSoundRoomInvitation(
  action: "lookup" | "complete",
  inviteToken: string,
  actorUserId: string,
  profile?: unknown,
  fetchImpl = fetch
): Promise<InvitationContext> {
  const origin = creatorHubApiUrl();
  const key = process.env.EXTERNAL_API_KEY?.trim();
  if (!origin || !key) throw new InvitationError(503);
  const response = await fetchImpl(
    `${origin}/api/integrations/easeverse/invitations/${action}`,
    {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify({
        inviteToken,
        actorUserId,
        ...(action === "complete" ? { profile } : {}),
      }),
    }
  );
  if (!response.ok) throw new InvitationError(response.status);
  return (await response.json()) as InvitationContext;
}
