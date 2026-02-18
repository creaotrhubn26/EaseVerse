import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { parseProToolsSessionInfoBuffer, toProToolsSyncPayload } from './adapters/protools-session-info-parser';

function normalizeTrackId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

async function main() {
  const filePath = process.argv[2];
  const explicitTrackId = process.argv[3];

  if (!filePath) {
    console.error('Usage: npm run companion:parse -- <session-info-file> [externalTrackId]');
    process.exit(1);
  }

  const raw = await readFile(filePath);
  const parsed = parseProToolsSessionInfoBuffer(raw);
  const trackId =
    explicitTrackId?.trim() ||
    normalizeTrackId(parsed.sessionName || basename(filePath).replace(/\.[^.]+$/, ''));

  if (!trackId) {
    console.error('Could not infer externalTrackId. Pass it as the 2nd argument.');
    process.exit(1);
  }

  const payload = toProToolsSyncPayload({
    externalTrackId: trackId,
    source: 'protools-companion',
    parsed,
  });

  console.log(
    JSON.stringify(
      {
        summary: {
          sessionName: parsed.sessionName,
          inferredTrackId: trackId,
          bpm: parsed.bpm,
          markerCount: parsed.markers.length,
        },
        payload,
      },
      null,
      2
    )
  );
}

void main();
