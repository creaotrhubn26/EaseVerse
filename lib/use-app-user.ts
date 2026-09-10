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
};

export const AUTH_CONFIGURED = true;

export function useAppUser(): { user: AppUser | null; loading: boolean; reload: () => Promise<void> } {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isSignedIn) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const token = await getToken();
      if (!token) {
        setUser(null);
        return;
      }
      const response = await authedFetch("/api/users/me", token, {
        headers: getApiHeaders({
          "Content-Type": "application/json",
        }),
      });
      if (!response.ok) {
        setUser(null);
        return;
      }
      const data = (await response.json()) as AppUser;
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [getToken, isSignedIn]);

  useEffect(() => {
    if (!isLoaded) return;
    void load();
  }, [isLoaded, load]);

  return { user, loading, reload: load };
}
