import type { VercelRequest, VercelResponse } from "@vercel/node";
import { creatorHubUrl, easeVersePublicOrigin, readJson } from "../_lib/auth-upstream.js";
import { safeCreatorHubAuthNextPath } from "../../lib/auth-return.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const upstreamUrl = creatorHubUrl("/api/creatorhub/google/oauth/start");
  if (!upstreamUrl) return res.status(503).json({ error: "CreatorHub auth is not configured" });
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const platform = body.platform === "native" ? "native" : "web";
  const next = safeCreatorHubAuthNextPath(body.next);
  const callback = new URL("/auth/callback", easeVersePublicOrigin(req));
  if (platform === "native") callback.searchParams.set("native", "1");
  if (next) callback.searchParams.set("next", next);

  try {
    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        mode: "login",
        browserOrigin: easeVersePublicOrigin(req),
        returnPath: `${callback.pathname}${callback.search}`,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await readJson(response);
    if (!response.ok) {
      return res.status(response.status >= 500 ? 503 : response.status).json({
        error: typeof payload.error === "string" ? payload.error : "Could not start CreatorHub login",
      });
    }
    const authorizationUrl = typeof payload.authorizationUrl === "string" ? payload.authorizationUrl : "";
    const parsed = authorizationUrl ? new URL(authorizationUrl) : null;
    if (!parsed || parsed.protocol !== "https:" || parsed.hostname !== "accounts.google.com") {
      return res.status(502).json({ error: "CreatorHub returned an invalid login URL" });
    }
    return res.status(200).json({ authorizationUrl });
  } catch (error) {
    console.error("[auth/start] CreatorHub unavailable:", error instanceof Error ? error.message : error);
    return res.status(503).json({ error: "CreatorHub login is temporarily unavailable" });
  }
}
