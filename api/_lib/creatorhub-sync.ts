import { creatorHubApiUrl } from "./auth-upstream.js";

export type CreatorHubSyncResult = {
  configured: boolean;
  synced: boolean;
  status?: number;
  reason?: "missing_api_url" | "missing_api_key" | "timeout" | "network_error" | "http_error";
};

export async function pushKeeperToCreatorHub(
  payload: {
    ownerUserId: string;
    externalTrackId: string;
    takeId: string;
    url: string;
    filename?: string | null;
    durationSec?: number | null;
  },
  options: { apiUrl?: string; apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<CreatorHubSyncResult> {
  const apiUrl = (options.apiUrl ?? creatorHubApiUrl() ?? "").replace(/\/+$/, "");
  const apiKey = (options.apiKey ?? process.env.EXTERNAL_API_KEY ?? "").trim();
  if (!apiUrl) return { configured: false, synced: false, reason: "missing_api_url" };
  if (!apiKey) return { configured: false, synced: false, reason: "missing_api_key" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 6000);
  try {
    const response = await (options.fetchImpl ?? fetch)(`${apiUrl}/api/audio-showcases/easeverse/keeper`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ schemaVersion: 1, ...payload }),
      signal: controller.signal,
    });
    if (!response.ok) return { configured: true, synced: false, status: response.status, reason: "http_error" };
    return { configured: true, synced: true, status: response.status };
  } catch (error: any) {
    return { configured: true, synced: false, reason: error?.name === "AbortError" ? "timeout" : "network_error" };
  } finally {
    clearTimeout(timer);
  }
}
