import type { CompanionConfig } from './config';
import type { ProToolsSyncPayload, ProToolsSyncRecord } from './types';

const DEFAULT_API_BASE_CANDIDATES = ['http://127.0.0.1:5059', 'http://127.0.0.1:5061', 'http://127.0.0.1:5071', 'http://127.0.0.1:5000'];

let preferredApiBaseUrl: string | null = null;

export interface CollabLyricsItem {
  externalTrackId: string;
  projectId?: string;
  title: string;
  artist?: string;
  bpm?: number;
  lyrics: string;
  source?: string;
  updatedAt?: string;
}

function withOptionalFilters(
  url: URL,
  filters: { projectId?: string; source?: string; externalTrackId?: string }
) {
  if (filters.projectId) {
    url.searchParams.set('projectId', filters.projectId);
  }
  if (filters.source) {
    url.searchParams.set('source', filters.source);
  }
  if (filters.externalTrackId) {
    url.searchParams.set('externalTrackId', filters.externalTrackId);
  }
}

function withAuthHeaders(config: CompanionConfig): HeadersInit {
  if (!config.apiKey) {
    return {
      'content-type': 'application/json',
    };
  }

  return {
    'content-type': 'application/json',
    'x-api-key': config.apiKey,
  };
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function getApiBaseCandidates(config: CompanionConfig): string[] {
  const configured = normalizeBaseUrl(config.apiBaseUrl);
  const candidates = [
    preferredApiBaseUrl,
    configured,
    ...DEFAULT_API_BASE_CANDIDATES,
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(candidates.map(normalizeBaseUrl)));
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

async function parseJsonOrThrow<T>(response: Response, context: string): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    const body = await safeReadText(response);
    throw new Error(
      `${context}: expected JSON response but got ${contentType || 'unknown content-type'} (${body.slice(0, 200)})`
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    const body = await safeReadText(response);
    throw new Error(`${context}: invalid JSON response (${body.slice(0, 200)})`);
  }
}

async function requestWithFallback(
  config: CompanionConfig,
  relativePath: string,
  init: RequestInit,
  context: string,
  acceptedStatuses: number[] = []
): Promise<Response> {
  let lastError = '';

  for (const baseUrlCandidate of getApiBaseCandidates(config)) {
    try {
      const response = await fetch(`${baseUrlCandidate}${relativePath}`, init);
      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.toLowerCase().includes('application/json');

      if (response.ok || acceptedStatuses.includes(response.status)) {
        if (!isJson) {
          const body = await safeReadText(response);
          lastError =
            `${context} failed at ${baseUrlCandidate}: expected JSON response but got ` +
            `${contentType || 'unknown content-type'} (${body.slice(0, 200)})`;
          continue;
        }

        preferredApiBaseUrl = baseUrlCandidate;
        return response;
      }

      const body = await safeReadText(response);
      lastError = `${context} failed at ${baseUrlCandidate} (${response.status}): ${body}`;

      if (response.status === 404 || response.status === 503) {
        continue;
      }

      throw new Error(lastError);
    } catch (error) {
      lastError = error instanceof Error ? error.message : `${context} failed at ${baseUrlCandidate}`;
    }
  }

  throw new Error(
    `${context}: could not reach a compatible API endpoint. Last error: ${lastError || 'unknown error'}`
  );
}

export async function upsertProToolsSync(
  config: CompanionConfig,
  payload: ProToolsSyncPayload
): Promise<ProToolsSyncRecord> {
  const response = await requestWithFallback(
    config,
    '/api/v1/collab/protools',
    {
      method: 'POST',
      headers: withAuthHeaders(config),
      body: JSON.stringify(payload),
    },
    'ProTools sync upsert'
  );

  const data = await parseJsonOrThrow<{ item?: ProToolsSyncRecord }>(response, 'ProTools sync upsert');
  if (!data.item) {
    throw new Error('ProTools sync upsert response did not include item');
  }
  return data.item;
}

export async function fetchLatestProToolsSync(
  config: CompanionConfig,
  externalTrackId: string
): Promise<ProToolsSyncRecord | null> {
  const path = `/api/v1/collab/protools/${encodeURIComponent(externalTrackId)}`;
  const url = new URL(`http://127.0.0.1${path}`);
  if (config.projectId) {
    url.searchParams.set('projectId', config.projectId);
  }

  const response = await requestWithFallback(
    config,
    `${path}${url.search}`,
    {
      method: 'GET',
      headers: config.apiKey ? { 'x-api-key': config.apiKey } : undefined,
    },
    'Fetch latest ProTools sync',
    [404]
  );

  if (response.status === 404) {
    return null;
  }

  const data = await parseJsonOrThrow<{ item?: ProToolsSyncRecord }>(response, 'Fetch latest ProTools sync');
  return data.item ?? null;
}

export async function fetchProToolsSyncList(
  config: CompanionConfig,
  filters?: { externalTrackId?: string }
): Promise<ProToolsSyncRecord[]> {
  const path = '/api/v1/collab/protools';
  const url = new URL(`http://127.0.0.1${path}`);
  withOptionalFilters(url, {
    projectId: config.projectId,
    source: config.source,
    externalTrackId: filters?.externalTrackId,
  });

  const response = await requestWithFallback(
    config,
    `${path}${url.search}`,
    {
      method: 'GET',
      headers: config.apiKey ? { 'x-api-key': config.apiKey } : undefined,
    },
    'Fetch ProTools sync list'
  );

  const data = await parseJsonOrThrow<{ items?: ProToolsSyncRecord[] }>(response, 'Fetch ProTools sync list');
  return Array.isArray(data.items) ? data.items : [];
}

export async function fetchCollabLyricsList(
  config: CompanionConfig,
  filters?: { externalTrackId?: string }
): Promise<CollabLyricsItem[]> {
  const path = '/api/v1/collab/lyrics';
  const url = new URL(`http://127.0.0.1${path}`);
  withOptionalFilters(url, {
    projectId: config.projectId,
    source: config.source,
    externalTrackId: filters?.externalTrackId,
  });

  const response = await requestWithFallback(
    config,
    `${path}${url.search}`,
    {
      method: 'GET',
      headers: config.apiKey ? { 'x-api-key': config.apiKey } : undefined,
    },
    'Fetch collab lyrics list'
  );

  const data = await parseJsonOrThrow<{ items?: CollabLyricsItem[] }>(response, 'Fetch collab lyrics list');
  return Array.isArray(data.items) ? data.items : [];
}
