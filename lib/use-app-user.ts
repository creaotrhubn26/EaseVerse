import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { getApiHeaders, getApiUrl } from "./query-client";

export type AppUser = {
  userId: string;
  email: string | null;
  status: "pending" | "approved" | "admin" | "banned";
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  pilotExpiresAt: string | null;
};

export const CLERK_CONFIGURED = Boolean(process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY);

// Caller is responsible for only calling this when Clerk is configured (so the
// `<ClerkProvider>` exists). When Clerk is unconfigured, render a stub instead.
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
      const response = await fetch(`${getApiUrl()}/api/users/me`, {
        headers: getApiHeaders({
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
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
