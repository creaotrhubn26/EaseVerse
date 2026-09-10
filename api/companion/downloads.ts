import type { VercelRequest, VercelResponse } from "@vercel/node";

const CREATORHUB_API = (process.env.CREATORHUB_API_URL || "https://creatorhub-backend-rtbl.onrender.com").replace(/\/+$/, "");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const upstream = await fetch(`${CREATORHUB_API}/api/protools/companion/release`, {
      headers: { Accept: "application/json", "User-Agent": "EaseVerse/companion-directory" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) throw new Error(`upstream_${upstream.status}`);
    const payload = await upstream.json() as Record<string, unknown>;
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    return res.status(200).json({
      ...payload,
      product: "CreatorHub Pro Tools Companion",
      repo: "https://github.com/creaotrhubn26/Creatorhubn-monorepo",
      managedFrom: "CreatorHub Workspace → Sound Room",
    });
  } catch {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "canonical_companion_release_unavailable" });
  }
}
