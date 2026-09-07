import type { VercelRequest } from "@vercel/node";

export const DEFAULT_CREATORHUB_API_URL = "https://www.creatorhubn.com";
export const DEFAULT_EASEVERSE_PUBLIC_URL = "https://easeverse.netlify.app";

function parsedHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return url.protocol === "https:" || (url.protocol === "http:" && local) ? url : null;
  } catch {
    return null;
  }
}

export function creatorHubApiUrl(): string | null {
  const configured = process.env.CREATORHUB_API_URL?.trim() || DEFAULT_CREATORHUB_API_URL;
  return parsedHttpsUrl(configured)?.origin ?? null;
}

export function easeVersePublicOrigin(req?: VercelRequest): string {
  const configured = process.env.EASEVERSE_PUBLIC_URL?.trim() || DEFAULT_EASEVERSE_PUBLIC_URL;
  const configuredOrigin = parsedHttpsUrl(configured)?.origin ?? DEFAULT_EASEVERSE_PUBLIC_URL;
  if (process.env.NODE_ENV === "production" || !req) return configuredOrigin;

  const rawOrigin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin;
  const requestOrigin = rawOrigin ? parsedHttpsUrl(rawOrigin)?.origin : null;
  return requestOrigin && /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(requestOrigin)
    ? requestOrigin
    : configuredOrigin;
}

export function creatorHubUrl(path: string): string | null {
  const base = creatorHubApiUrl();
  return base ? new URL(path, `${base}/`).toString() : null;
}

export function transferId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}
