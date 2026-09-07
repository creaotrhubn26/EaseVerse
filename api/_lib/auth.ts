import type { VercelRequest, VercelResponse } from "@vercel/node";
import { creatorHubUrl } from "./auth-upstream.js";
import { resolvePairingToken } from "./pairing-db.js";
import { readCreatorHubSessionCookie } from "./auth-cookie.js";

export type CreatorHubAuthUser = {
  id: string;
  email: string;
  name: string;
  role?: string;
  profession?: string;
  userType?: string;
  displayName?: string;
  picture?: string;
  verified_email?: boolean;
  isAdmin?: boolean;
};

type AuthResolution =
  | { status: "authenticated"; user: CreatorHubAuthUser }
  | { status: "unauthenticated" }
  | { status: "unavailable" };

type AuthedVercelRequest = VercelRequest & { creatorHubUser?: CreatorHubAuthUser };
const recentUsers = new Map<string, { user: CreatorHubAuthUser; expiresAt: number }>();

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeUser(value: unknown): CreatorHubAuthUser | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = stringValue(raw.id) ?? stringValue(raw.userId);
  const email = stringValue(raw.email)?.toLowerCase() ?? null;
  if (!id || !email) return null;
  const name = stringValue(raw.name) ?? stringValue(raw.displayName) ?? email.split("@")[0];
  const role = stringValue(raw.role) ?? undefined;
  return {
    id,
    email,
    name,
    role,
    profession: stringValue(raw.profession) ?? undefined,
    userType: stringValue(raw.userType) ?? undefined,
    displayName: stringValue(raw.displayName) ?? stringValue(raw.display_name) ?? name,
    picture: stringValue(raw.picture) ?? undefined,
    verified_email: raw.verified_email === true,
    isAdmin: raw.isAdmin === true || role === "admin" || role === "super_admin",
  };
}

export function isAuthConfigured(): boolean {
  return creatorHubUrl("/api/auth/user") !== null;
}

export async function resolveCreatorHubSession(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthResolution> {
  const normalizedToken = token.trim();
  const url = creatorHubUrl("/api/auth/user");
  if (!url) return { status: "unavailable" };
  if (!normalizedToken || normalizedToken.length > 512) return { status: "unauthenticated" };
  try {
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${normalizedToken}`, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401 || response.status === 403) return { status: "unauthenticated" };
    if (!response.ok) return { status: "unavailable" };
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const user = normalizeUser(payload?.user);
    if (payload?.authenticated !== true || !user) return { status: "unauthenticated" };
    return { status: "authenticated", user };
  } catch {
    return { status: "unavailable" };
  }
}

function bearer(req: VercelRequest): string | null {
  const raw = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  const match = raw?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function getAuthenticatedUser(req: VercelRequest): CreatorHubAuthUser | null {
  return (req as AuthedVercelRequest).creatorHubUser ?? null;
}

export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse,
): Promise<string | null> {
  res.setHeader("Cache-Control", "no-store");
  const token = bearer(req) ?? readCreatorHubSessionCookie(req);
  if (!token) {
    res.status(401).json({ error: "Missing CreatorHub session" });
    return null;
  }
  const resolution = await resolveCreatorHubSession(token);
  if (resolution.status === "unavailable") {
    res.status(503).json({ error: "CreatorHub authentication is temporarily unavailable" });
    return null;
  }
  if (resolution.status !== "authenticated") {
    res.status(401).json({ error: "Invalid or expired CreatorHub session" });
    return null;
  }
  (req as AuthedVercelRequest).creatorHubUser = resolution.user;
  recentUsers.set(resolution.user.id, {
    user: resolution.user,
    expiresAt: Date.now() + 5 * 60_000,
  });
  return resolution.user.id;
}

export async function requireAuthOrPairing(
  req: VercelRequest,
  res: VercelResponse,
): Promise<string | null> {
  const token = bearer(req) ?? readCreatorHubSessionCookie(req);
  if (!token) {
    res.status(401).json({ error: "Missing CreatorHub session" });
    return null;
  }
  if (token.startsWith("pair_")) {
    const record = await resolvePairingToken(token);
    if (!record) {
      res.status(401).json({ error: "Invalid or expired pairing token" });
      return null;
    }
    return record.userId;
  }
  return requireAuth(req, res);
}

export async function fetchUserEmail(userId: string): Promise<string | null> {
  const cached = recentUsers.get(userId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    recentUsers.delete(userId);
    return null;
  }
  return cached.user.email;
}
