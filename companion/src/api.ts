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

function mimeForFilename(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    wav: 'audio/wav', wave: 'audio/wav', aif: 'audio/aiff', aiff: 'audio/aiff',
    mp3: 'audio/mpeg', m4a: 'audio/x-m4a', mp4: 'audio/mp4', flac: 'audio/flac', ogg: 'audio/ogg',
  };
  return map[ext] || 'application/octet-stream';
}

// Backblaze B2-opplasting i to steg (erstatter Vercel Blob): be backend om en
// presignert PUT-URL, PUT bytes direkte til B2, finaliser (oppretter take-rad).
export async function uploadTake(
  config: CompanionConfig,
  args: { file: Buffer; filename: string; absolutePath: string; externalTrackId?: string }
): Promise<{ url: string; pathname: string }> {
  if (!config.pairingToken) {
    throw new Error('uploadTake: missing pairingToken (set EASEVERSE_PAIR_TOKEN)');
  }
  const baseUrl = preferredApiBaseUrl || normalizeBaseUrl(config.apiBaseUrl);
  const externalTrackId = args.externalTrackId ?? config.trackId ?? null;
  const contentType = mimeForFilename(args.filename);
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${config.pairingToken}` };

  const initRes = await fetch(`${baseUrl}/api/takes/upload`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ filename: args.filename, contentType, byteSize: args.file.length }),
  });
  if (!initRes.ok) throw new Error(`Upload init failed: ${initRes.status} ${await initRes.text()}`);
  const { takeId, uploadUrl, key } = (await initRes.json()) as {
    takeId: string;
    uploadUrl: string;
    key: string;
  };

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: new Uint8Array(args.file),
  });
  if (!putRes.ok) throw new Error(`B2 upload failed: ${putRes.status}`);

  const finRes = await fetch(`${baseUrl}/api/takes/finalize`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      takeId,
      filename: args.filename,
      externalTrackId,
      sourcePath: args.absolutePath,
    }),
  });
  if (!finRes.ok) throw new Error(`Finalize failed: ${finRes.status} ${await finRes.text()}`);
  const data = (await finRes.json()) as { take?: { storageUrl?: string } };
  return { url: data?.take?.storageUrl ?? '', pathname: key };
}

export type CompanionSnapshot = {
  generatedAt: string;
  keepers: Array<{
    id: string;
    filename: string;
    sourcePath: string | null;
    externalTrackId: string | null;
    durationSec: number | null;
    uploadedAt: string;
    decisionLockedAt: string | null;
  }>;
  markers: Array<{
    takeId: string;
    externalTrackId: string | null;
    sourcePath: string | null;
    filename: string;
    seconds: number;
    label: string | null;
  }>;
  regions: Array<{
    regionId: string;
    takeId: string;
    externalTrackId: string | null;
    sourcePath: string | null;
    filename: string;
    startSec: number;
    endSec: number;
    label: string | null;
  }>;
  checkpoints: Array<{ id: string; source: string; payload: unknown; capturedAt: string }>;
  pendingCompExports?: Array<{
    compId: string;
    name: string;
    externalTrackId: string | null;
    wavUrl: string | null;
    filename: string | null;
    exportedAt: string | null;
  }>;
};

export async function fetchCompanionSnapshot(
  config: CompanionConfig
): Promise<CompanionSnapshot> {
  if (!config.pairingToken) {
    throw new Error('fetchCompanionSnapshot: missing pairingToken');
  }
  const base = preferredApiBaseUrl || normalizeBaseUrl(config.apiBaseUrl);
  const url = new URL(`${base}/api/companion/snapshot`);
  if (config.projectId) url.searchParams.set('projectId', config.projectId);
  if (config.trackId) url.searchParams.set('trackId', config.trackId);
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${config.pairingToken}` },
  });
  if (!response.ok) {
    const body = await safeReadText(response);
    throw new Error(`Snapshot fetch failed: ${response.status} ${body.slice(0, 200)}`);
  }
  return (await response.json()) as CompanionSnapshot;
}

export async function postSessionCheckpoint(
  config: CompanionConfig,
  args: { source: string; payload: unknown }
): Promise<{ id: string; capturedAt: string }> {
  if (!config.pairingToken) {
    throw new Error('postSessionCheckpoint: missing pairingToken');
  }
  const base = preferredApiBaseUrl || normalizeBaseUrl(config.apiBaseUrl);
  const response = await fetch(`${base}/api/companion/checkpoint`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${config.pairingToken}`,
    },
    body: JSON.stringify({
      projectId: config.projectId ?? undefined,
      externalTrackId: config.trackId ?? undefined,
      source: args.source,
      payload: args.payload,
    }),
  });
  if (!response.ok) {
    const body = await safeReadText(response);
    throw new Error(`Checkpoint POST failed: ${response.status} ${body.slice(0, 200)}`);
  }
  return (await response.json()) as { id: string; capturedAt: string };
}

export async function downloadCompExport(
  config: CompanionConfig,
  args: { wavUrl: string; targetPath: string }
): Promise<void> {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const path = await import('node:path');
  const response = await fetch(args.wavUrl);
  if (!response.ok) {
    throw new Error(`download wav failed ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await mkdir(path.dirname(args.targetPath), { recursive: true });
  await writeFile(args.targetPath, buffer);
}

export async function ackCompExport(
  config: CompanionConfig,
  compId: string
): Promise<void> {
  if (!config.pairingToken) throw new Error('ackCompExport: missing pairingToken');
  const base = preferredApiBaseUrl || normalizeBaseUrl(config.apiBaseUrl);
  const response = await fetch(
    `${base}/api/takes/comp-export?id=${encodeURIComponent(compId)}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${config.pairingToken}` },
    }
  );
  if (!response.ok) {
    throw new Error(`ack comp export failed ${response.status}`);
  }
}
