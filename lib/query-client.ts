import { fetch } from "expo/fetch";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Gets the base URL for the Express API server (e.g., "http://localhost:3000")
 * @returns {string} The API base URL
 */
export function getApiUrl(): string {
  const runtimeOverride = (globalThis as { __E2E_API_BASE__?: string }).__E2E_API_BASE__;
  if (runtimeOverride) {
    try {
      return new URL(runtimeOverride).href;
    } catch {
      // Fall through to env resolution.
    }
  }

  const explicitApiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (explicitApiUrl) {
    try {
      return new URL(explicitApiUrl).href;
    } catch {
      // Fall through to domain/default resolution.
    }
  }

  const host = process.env.EXPO_PUBLIC_DOMAIN;
  if (host) {
    const hasProtocol = host.startsWith("http://") || host.startsWith("https://");
    try {
      if (hasProtocol) {
        return new URL(host).href;
      }
      const protocol = host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
      return new URL(`${protocol}://${host}`).href;
    } catch {
      // Fall through to runtime/default resolution.
    }
  }

  const runtimeLocation = (globalThis as { location?: { origin?: string } }).location;
  if (runtimeLocation?.origin) {
    try {
      const runtimeUrl = new URL(runtimeLocation.origin);
      const isLocalHost =
        runtimeUrl.hostname === "localhost" || runtimeUrl.hostname === "127.0.0.1";
      const isExpoWebDevPort = new Set([
        "8081",
        "8082",
        "8083",
        "8084",
        "8085",
        "19000",
        "19001",
        "19002",
        "19006",
      ]).has(runtimeUrl.port);

      // When running Expo web dev server, local API is usually served separately on :5000.
      if (isLocalHost && isExpoWebDevPort) {
        return "http://localhost:5000/";
      }

      return runtimeUrl.href;
    } catch {
      // Fall through to default.
    }
  }

  return "http://localhost:5000/";
}

export function getApiHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extraHeaders };
  const apiKey = process.env.EXPO_PUBLIC_API_KEY;
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const res = await fetch(url.toString(), {
    method,
    headers: data ? getApiHeaders({ "Content-Type": "application/json" }) : getApiHeaders(),
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const res = await fetch(url.toString(), {
      headers: getApiHeaders(),
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
