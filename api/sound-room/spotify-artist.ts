import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/auth.js";
import { creatorHubApiUrl } from "../_lib/auth-upstream.js";

export function createSpotifyArtistHandler(
  auth = requireAuth,
  fetchImpl = fetch,
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "method_not_allowed" });
    }
    const actor = await auth(req, res);
    if (!actor) return;
    const { inviteToken, query } = req.body || {};
    if (
      typeof inviteToken !== "string" ||
      !/^inv_[A-Za-z0-9_-]{16,76}$/.test(inviteToken) ||
      typeof query !== "string" ||
      query.length > 120
    )
      return res.status(400).json({ error: "invalid_request" });
    const origin = creatorHubApiUrl(),
      key = process.env.EXTERNAL_API_KEY?.trim();
    if (!origin || !key)
      return res.status(503).json({ error: "spotify_unavailable" });
    try {
      const response = await fetchImpl(
        `${origin}/api/integrations/easeverse/invitations/spotify`,
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: { "content-type": "application/json", "x-api-key": key },
          body: JSON.stringify({ inviteToken, actorUserId: actor, query }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 429)
          res.setHeader(
            "Retry-After",
            response.headers.get("Retry-After") || "30",
          );
        return res
          .status(
            [400, 404, 429].includes(response.status) ? response.status : 503,
          )
          .json({
            error:
              response.status === 400
                ? "spotify_artist_link_required"
                : response.status === 404
                  ? "invitation_unavailable"
                  : "spotify_unavailable",
          });
      }
      return res.json({
        artists: data.artists || [],
        resolved: data.resolved === true,
      });
    } catch {
      return res.status(503).json({ error: "spotify_unavailable" });
    }
  };
}
export default createSpotifyArtistHandler();
