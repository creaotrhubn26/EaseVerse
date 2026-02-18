import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseProToolsSessionInfoBuffer, toProToolsSyncPayload } from './adapters/protools-session-info-parser';

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function readEnvFile(path: string): Promise<Record<string, string>> {
  try {
    const raw = await readFile(path, 'utf8');
    const result: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex <= 0) {
        continue;
      }
      const key = trimmed.slice(0, eqIndex).trim();
      const value = stripQuotes(trimmed.slice(eqIndex + 1));
      if (key) {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

async function main() {
  const root = process.cwd();
  const envFile = await readEnvFile(resolve(root, '.env'));

  const apiBaseUrl =
    process.env.EASEVERSE_API_BASE_URL ||
    envFile.EASEVERSE_API_BASE_URL ||
    process.env.EXPO_PUBLIC_API_URL ||
    envFile.EXPO_PUBLIC_API_URL ||
    'http://127.0.0.1:5059';

  const apiKey = process.env.EASEVERSE_API_KEY || envFile.EASEVERSE_API_KEY || envFile.EXTERNAL_API_KEY;
  const projectId = process.env.PROTOOLS_PROJECT_ID || envFile.PROTOOLS_PROJECT_ID || 'album-a';
  const source = process.env.PROTOOLS_SOURCE || envFile.PROTOOLS_SOURCE || 'protools-companion';
  const trackId = process.env.PROTOOLS_TRACK_ID || envFile.PROTOOLS_TRACK_ID || 'pt-demo-track-001';

  const sampleFile = resolve(root, 'companion/examples/protools-session-info.txt');
  const raw = await readFile(sampleFile);
  const parsed = parseProToolsSessionInfoBuffer(raw);
  const payload = toProToolsSyncPayload({
    externalTrackId: trackId,
    projectId,
    source,
    parsed,
  });

  const baseCandidates = [
    apiBaseUrl,
    'http://127.0.0.1:5059',
    'http://127.0.0.1:5061',
    'http://127.0.0.1:5000',
  ].map((value) => value.replace(/\/$/, ''));

  const uniqueBaseCandidates = Array.from(new Set(baseCandidates));

  let response: Response | null = null;
  let selectedBaseUrl = apiBaseUrl.replace(/\/$/, '');
  let lastErrorMessage = '';

  for (const baseUrlCandidate of uniqueBaseCandidates) {
    try {
      const attempt = await fetch(`${baseUrlCandidate}/api/v1/collab/protools`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (attempt.ok) {
        const contentType = attempt.headers.get('content-type') || '';
        if (!contentType.toLowerCase().includes('application/json')) {
          const body = await attempt.text();
          lastErrorMessage =
            `Push failed at ${baseUrlCandidate}: expected JSON response but got ` +
            `${contentType || 'unknown content-type'} (${body.slice(0, 200)})`;
          continue;
        }

        response = attempt;
        selectedBaseUrl = baseUrlCandidate;
        break;
      }

      const body = await attempt.text();
      lastErrorMessage = `Push failed at ${baseUrlCandidate} (${attempt.status}): ${body}`;

      if (attempt.status !== 404 && attempt.status !== 503) {
        throw new Error(lastErrorMessage);
      }
    } catch (error) {
      lastErrorMessage =
        error instanceof Error ? error.message : `Unknown error at ${baseUrlCandidate}`;
    }
  }

  if (!response) {
    throw new Error(
      `Could not push sample payload to any candidate API base URL. Last error: ${lastErrorMessage}`
    );
  }

  const data = (await response.json()) as { item?: { externalTrackId?: string; bpm?: number; markers?: unknown[] } };
  const markerCount = Array.isArray(data.item?.markers) ? data.item?.markers.length : 0;

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBaseUrl: selectedBaseUrl,
        externalTrackId: data.item?.externalTrackId || trackId,
        bpm: data.item?.bpm ?? parsed.bpm,
        markers: markerCount,
      },
      null,
      2
    )
  );
}

void main();
