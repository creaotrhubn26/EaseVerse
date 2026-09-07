import type { VercelRequest, VercelResponse } from "@vercel/node";

export const CREATORHUB_SESSION_COOKIE = "easeverse_creatorhub_session";

function cookieHeader(req: VercelRequest): string {
  const raw = req.headers.cookie;
  return Array.isArray(raw) ? raw.join("; ") : raw ?? "";
}

export function readCreatorHubSessionCookie(req: VercelRequest): string | null {
  for (const part of cookieHeader(req).split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== CREATORHUB_SESSION_COOKIE) continue;
    try {
      const value = decodeURIComponent(part.slice(separator + 1).trim());
      return value && value.length <= 512 ? value : null;
    } catch {
      return null;
    }
  }
  return null;
}

function cookie(value: string, maxAge: number): string {
  return [
    `${CREATORHUB_SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

export function setCreatorHubSessionCookie(res: VercelResponse, token: string): void {
  res.setHeader("Set-Cookie", cookie(token, 30 * 24 * 60 * 60));
}

export function clearCreatorHubSessionCookie(res: VercelResponse): void {
  res.setHeader("Set-Cookie", cookie("", 0));
}
