import type { VercelRequest, VercelResponse } from "@vercel/node";
import { creatorHubUrl, readJson } from "../_lib/auth-upstream.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const authorization = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing bearer token" });
  const upstreamUrl = creatorHubUrl("/api/auth/logout");
  if (!upstreamUrl) return res.status(503).json({ error: "CreatorHub auth is not configured" });

  try {
    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers: { Authorization: authorization, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await readJson(response);
    return res.status(response.ok ? 200 : response.status).json(response.ok ? { success: true } : payload);
  } catch (error) {
    console.error("[auth/logout] CreatorHub unavailable:", error instanceof Error ? error.message : error);
    return res.status(503).json({ error: "CreatorHub logout is temporarily unavailable" });
  }
}
