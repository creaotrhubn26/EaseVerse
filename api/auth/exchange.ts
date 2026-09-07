import type { VercelRequest, VercelResponse } from "@vercel/node";
import { creatorHubUrl, readJson, transferId } from "../_lib/auth-upstream.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const id = transferId(body.transferId);
  if (!id) return res.status(400).json({ error: "A valid transferId is required" });
  const upstreamUrl = creatorHubUrl(`/api/creatorhub/google/oauth/session-result/${encodeURIComponent(id)}`);
  if (!upstreamUrl) return res.status(503).json({ error: "CreatorHub auth is not configured" });

  try {
    const response = await fetch(upstreamUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await readJson(response);
    if (!response.ok) {
      return res.status(response.status === 404 ? 410 : 502).json({
        error: typeof payload.error === "string" ? payload.error : "CreatorHub login exchange failed",
      });
    }
    const token = typeof payload.sessionToken === "string" ? payload.sessionToken.trim() : "";
    const user = payload.user && typeof payload.user === "object" ? payload.user : null;
    if (!token || !user) return res.status(502).json({ error: "CreatorHub returned an incomplete session" });
    return res.status(200).json({ token, user });
  } catch (error) {
    console.error("[auth/exchange] CreatorHub unavailable:", error instanceof Error ? error.message : error);
    return res.status(503).json({ error: "CreatorHub login exchange is temporarily unavailable" });
  }
}
