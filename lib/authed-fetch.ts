import { getApiHeaders, getApiUrl } from "./query-client";

export async function authedFetch(
  path: string,
  token: string | null,
  init: RequestInit = {},
): Promise<Response> {
  const baseHeaders = getApiHeaders({ "Content-Type": "application/json" });
  const headers: Record<string, string> = { ...(baseHeaders as Record<string, string>) };
  if (init.headers) {
    Object.assign(headers, init.headers as Record<string, string>);
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${getApiUrl()}${path}`, { ...init, headers });
}
