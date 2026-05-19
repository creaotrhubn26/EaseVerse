import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClerkClient, verifyToken } from "@clerk/backend";

const secretKey = process.env.CLERK_SECRET_KEY;
const publishableKey =
  process.env.CLERK_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

const clerk =
  secretKey && publishableKey
    ? createClerkClient({ secretKey, publishableKey })
    : null;

export function isClerkConfigured(): boolean {
  return clerk !== null;
}

export type AuthedRequest = VercelRequest & { userId: string };

export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse,
): Promise<string | null> {
  if (!clerk || !secretKey) {
    res.status(503).json({
      error: "Auth is not configured. Set CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY.",
    });
    return null;
  }

  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return null;
  }

  try {
    const payload = await verifyToken(token, { secretKey });
    if (!payload.sub) {
      res.status(401).json({ error: "Invalid token" });
      return null;
    }
    return payload.sub;
  } catch (error) {
    console.warn("Clerk token verification failed:", error);
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }
}
