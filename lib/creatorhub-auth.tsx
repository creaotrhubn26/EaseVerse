import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import { getApiHeaders, getApiUrl } from "./query-client";
import { onInvalidCreatorHubSession } from "./auth-session-events";

const AUTH_TOKEN_KEY = "creatorhub_auth_token";
const AUTH_USER_KEY = "creatorhub_auth_user";
const NATIVE_CALLBACK_URL = "easeverse://auth/callback";

export const AUTH_CONFIGURED = true;

export type CreatorHubUser = {
  id: string;
  email: string;
  name: string;
  displayName?: string;
  role?: string;
  profession?: string;
  userType?: string;
  picture?: string;
  verified_email?: boolean;
  isAdmin?: boolean;
};

type AuthContextValue = {
  user: CreatorHubUser | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  isSigningIn: boolean;
  getToken: () => Promise<string | null>;
  signIn: () => Promise<boolean>;
  completeSignIn: (transferId: string) => Promise<CreatorHubUser>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeUser(value: unknown): CreatorHubUser | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = stringValue(record.id) ?? stringValue(record.userId);
  const email = stringValue(record.email)?.toLowerCase() ?? null;
  if (!id || !email) return null;
  const name =
    stringValue(record.name)
    ?? stringValue(record.displayName)
    ?? stringValue(record.display_name)
    ?? email.split("@")[0];
  return {
    id,
    email,
    name,
    displayName:
      stringValue(record.displayName)
      ?? stringValue(record.display_name)
      ?? name,
    role: stringValue(record.role) ?? undefined,
    profession: stringValue(record.profession) ?? undefined,
    userType: stringValue(record.userType) ?? undefined,
    picture: stringValue(record.picture) ?? undefined,
    verified_email: record.verified_email === true,
    isAdmin:
      record.isAdmin === true
      || record.role === "admin"
      || record.role === "super_admin",
  };
}

function apiUrl(path: string): string {
  return new URL(path, getApiUrl()).toString();
}

async function readResponse(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = stringValue(body?.message) ?? stringValue(body?.error);
    throw new Error(message ?? `Authentication failed (${response.status})`);
  }
  return body ?? {};
}

async function readStoredValue(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key).catch(() => null);
}

async function writeStoredSession(token: string | null, user: CreatorHubUser): Promise<void> {
  const serializedUser = JSON.stringify(user);
  if (Platform.OS === "web") {
    globalThis.localStorage?.removeItem(AUTH_TOKEN_KEY);
    globalThis.localStorage?.setItem(AUTH_USER_KEY, serializedUser);
    return;
  }
  if (!token) throw new Error("Native authentication requires a session token.");
  await Promise.all([
    SecureStore.setItemAsync(AUTH_TOKEN_KEY, token),
    SecureStore.setItemAsync(AUTH_USER_KEY, serializedUser),
  ]);
}

async function clearStoredSession(): Promise<void> {
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.removeItem(AUTH_TOKEN_KEY);
      globalThis.localStorage?.removeItem(AUTH_USER_KEY);
    } catch {
      // Storage can be unavailable in privacy-restricted browsers.
    }
    return;
  }
  await Promise.all([
    SecureStore.deleteItemAsync(AUTH_TOKEN_KEY),
    SecureStore.deleteItemAsync(AUTH_USER_KEY),
  ]).catch(() => undefined);
}

function callbackValue(url: string, key: string): string | null {
  try {
    return new URL(url).searchParams.get(key);
  } catch {
    return null;
  }
}

export function CreatorHubAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CreatorHubUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const tokenRef = useRef<string | null>(null);

  const updateSession = useCallback(async (nextToken: string | null, nextUser: CreatorHubUser) => {
    await writeStoredSession(nextToken, nextUser);
    tokenRef.current = nextToken;
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const clearSession = useCallback(async () => {
    await clearStoredSession();
    tokenRef.current = null;
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => onInvalidCreatorHubSession(async () => {
    await clearSession();
  }), [clearSession]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [storedToken, serializedUser] = await Promise.all([
        readStoredValue(AUTH_TOKEN_KEY),
        readStoredValue(AUTH_USER_KEY),
      ]);
      let storedUser: CreatorHubUser | null = null;
      try {
        storedUser = serializedUser ? normalizeUser(JSON.parse(serializedUser)) : null;
      } catch {
        storedUser = null;
      }

      if (Platform.OS === "web" || (storedToken && storedUser)) {
        try {
          const response = await fetch(apiUrl("/api/auth/session"), {
            credentials: "include",
            headers: getApiHeaders(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
          });
          const payload = await readResponse(response);
          const validatedUser = normalizeUser(payload.user);
          if (validatedUser && !cancelled) {
            await updateSession(Platform.OS === "web" ? null : storedToken, validatedUser);
          } else if (!cancelled) {
            await clearSession();
          }
        } catch {
          if (!cancelled) await clearSession();
        }
      } else if (!cancelled) {
        await clearSession();
      }

      if (!cancelled) setIsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [clearSession, updateSession]);

  const completeSignIn = useCallback(async (transferId: string) => {
    const platform = Platform.OS === "web" ? "web" : "native";
    const response = await fetch(apiUrl("/api/auth/exchange"), {
      method: "POST",
      credentials: "include",
      headers: getApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ transferId, platform }),
    });
    const payload = await readResponse(response);
    const nextToken = stringValue(payload.token);
    const nextUser = normalizeUser(payload.user);
    if (!nextUser || (platform === "native" && !nextToken)) {
      throw new Error("CreatorHub returned an incomplete session.");
    }
    await updateSession(platform === "web" ? null : nextToken, nextUser);
    return nextUser;
  }, [updateSession]);

  const signIn = useCallback(async () => {
    if (isSigningIn) return false;
    setIsSigningIn(true);
    try {
      const platform = Platform.OS === "web" ? "web" : "native";
      const response = await fetch(apiUrl("/api/auth/start"), {
        method: "POST",
        credentials: "include",
        headers: getApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ platform }),
      });
      const payload = await readResponse(response);
      const authorizationUrl = stringValue(payload.authorizationUrl);
      if (!authorizationUrl) throw new Error("CreatorHub did not return a login URL.");

      if (Platform.OS === "web") {
        globalThis.location?.assign(authorizationUrl);
        return false;
      }

      const redirectUrl = Linking.createURL("auth/callback", { scheme: "easeverse" });
      const result = await WebBrowser.openAuthSessionAsync(authorizationUrl, redirectUrl);
      if (result.type !== "success" || !("url" in result)) {
        if (result.type === "cancel" || result.type === "dismiss") return false;
        throw new Error("CreatorHub login did not complete.");
      }
      const status = callbackValue(result.url, "chGoogleStatus");
      const message = callbackValue(result.url, "chGoogleMessage");
      const transferId = callbackValue(result.url, "chGoogleTransfer");
      if (status === "error") throw new Error(message ?? "CreatorHub login failed.");
      if (!transferId) throw new Error("CreatorHub login callback was incomplete.");
      await completeSignIn(transferId);
      return true;
    } finally {
      setIsSigningIn(false);
    }
  }, [completeSignIn, isSigningIn]);

  const signOut = useCallback(async () => {
    const currentToken = tokenRef.current;
    try {
      await fetch(apiUrl("/api/auth/logout"), {
        method: "POST",
        credentials: "include",
        headers: getApiHeaders(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
      });
    } finally {
      await clearSession();
    }
  }, [clearSession]);

  const getToken = useCallback(async () => tokenRef.current, []);
  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoaded,
    isSignedIn: Boolean(user && (Platform.OS === "web" || token)),
    isSigningIn,
    getToken,
    signIn,
    completeSignIn,
    signOut,
  }), [completeSignIn, getToken, isLoaded, isSigningIn, signIn, signOut, token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuthContext(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("CreatorHubAuthProvider is missing from the app root.");
  return value;
}

export function useAuth(): AuthContextValue {
  return useAuthContext();
}

export function useUser(): { user: CreatorHubUser | null; isLoaded: boolean } {
  const { user, isLoaded } = useAuthContext();
  return { user, isLoaded };
}

export { NATIVE_CALLBACK_URL };
