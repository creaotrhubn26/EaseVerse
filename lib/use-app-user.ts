import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/creatorhub-auth";
import { getApiHeaders } from "./query-client";
import { authedFetch } from "./authed-fetch";

export type AppUser = {
  userId: string;
  email: string | null;
  status: "pending" | "approved" | "admin" | "banned";
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  pilotExpiresAt: string | null;
  studioAccess?: { projectIds: string[] };
};

export const AUTH_CONFIGURED = true;

export function useAppUser(): { user: AppUser | null; loading: boolean; error: string | null; reload: () => Promise<void> } {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSignedIn) {
      setUser(null);
      setError(null);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const token = await getToken();
      const response = await authedFetch("/api/users/me", token, {
        headers: getApiHeaders({
          "Content-Type": "application/json",
        }),
      });
      if (!response.ok) {
        setUser(null);
        setError("Could not verify account access. Please try again.");
        return;
      }
      const data = (await response.json()) as AppUser;
      setUser(data);
    } catch {
      setUser(null);
      setError("Could not verify account access. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [getToken, isSignedIn]);

  useEffect(() => {
    if (!isLoaded) return;
    void load();
  }, [isLoaded, load]);

  return { user, loading, error, reload: load };
}
