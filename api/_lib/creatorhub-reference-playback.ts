import { creatorHubApiUrl } from "./auth-upstream.js";

export type CreatorHubReferencePlayback = {
  url: string;
  expiresInSeconds: number;
  versionId: string;
  fileName: string | null;
  contentType: string;
  durationSec: number | null;
};

export type CreatorHubReferencePlaybackResult = {
  configured: boolean;
  retrieved: boolean;
  status?: number;
  reference?: CreatorHubReferencePlayback;
  reason?: "missing_api_url" | "missing_api_key" | "timeout" | "network_error" | "http_error" | "invalid_response";
};

function finiteDuration(value: unknown): number | null {
  if (value == null) return null;
  const duration = Number(value);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function parseResponse(value: Record<string, unknown>): CreatorHubReferencePlayback | null {
  try {
    const url = new URL(String(value.url || ""));
    if (url.protocol !== "https:") return null;
    const expiresInSeconds = Number(value.expiresInSeconds);
    const versionId = String(value.versionId || "").trim();
    if (!Number.isFinite(expiresInSeconds) || expiresInSeconds < 60 || !versionId) return null;
    return {
      url: url.toString(),
      expiresInSeconds,
      versionId: versionId.slice(0, 160),
      fileName: value.fileName ? String(value.fileName).slice(0, 300) : null,
      contentType: String(value.contentType || "application/octet-stream").slice(0, 160),
      durationSec: finiteDuration(value.durationSec),
    };
  } catch {
    return null;
  }
}

export async function fetchCreatorHubReferencePlayback(
  input: { ownerUserId: string; audioReviewProjectId: string },
  options: { apiUrl?: string; apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<CreatorHubReferencePlaybackResult> {
  const apiUrl = (options.apiUrl ?? creatorHubApiUrl() ?? "").replace(/\/+$/, "");
  const apiKey = (options.apiKey ?? process.env.EXTERNAL_API_KEY ?? "").trim();
  if (!apiUrl) return { configured: false, retrieved: false, reason: "missing_api_url" };
  if (!apiKey) return { configured: false, retrieved: false, reason: "missing_api_key" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 6000);
  try {
    const response = await (options.fetchImpl ?? fetch)(
      `${apiUrl}/api/integrations/easeverse/reference-playback`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify(input),
        signal: controller.signal,
        redirect: "error",
      },
    );
    if (!response.ok) {
      return { configured: true, retrieved: false, status: response.status, reason: "http_error" };
    }
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const reference = parseResponse(body);
    if (!reference) {
      return { configured: true, retrieved: false, status: response.status, reason: "invalid_response" };
    }
    return { configured: true, retrieved: true, status: response.status, reference };
  } catch (error: any) {
    return {
      configured: true,
      retrieved: false,
      reason: error?.name === "AbortError" ? "timeout" : "network_error",
    };
  } finally {
    clearTimeout(timer);
  }
}
