import { getApiHeaders, getApiUrl } from "./query-client";
import { inspectCreatorHubAuthResponse } from "./auth-session-events";

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
  const response = await fetch(`${getApiUrl()}${path}`, { credentials: "include", ...init, headers });
  await inspectCreatorHubAuthResponse(response);
  return response;
}
