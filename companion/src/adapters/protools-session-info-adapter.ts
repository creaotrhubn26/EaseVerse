import { basename } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import type { CompanionConfig } from '../config';
import type { ProToolsSyncPayload } from '../types';
import { parseProToolsSessionInfoBuffer, toProToolsSyncPayload } from './protools-session-info-parser';

function normalizeTrackId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}


export class ProToolsSessionInfoAdapter {
  private lastMtimeMs = 0;

  constructor(private readonly config: CompanionConfig) {}

  async readPendingPayloads(): Promise<ProToolsSyncPayload[]> {
    const sessionInfoFilePath = this.config.sessionInfoFilePath;
    if (!sessionInfoFilePath) {
      return [];
    }

    const fileStat = await stat(sessionInfoFilePath);
    if (fileStat.mtimeMs <= this.lastMtimeMs) {
      return [];
    }

    const raw = await readFile(sessionInfoFilePath);
    this.lastMtimeMs = fileStat.mtimeMs;

    const parsed = parseProToolsSessionInfoBuffer(raw);
    const sessionName = parsed.sessionName;
    const inferredTrackId =
      this.config.trackId ||
      normalizeTrackId(sessionName || basename(sessionInfoFilePath).replace(/\.[^.]+$/, ''));

    if (!inferredTrackId) {
      return [];
    }

    return [
      toProToolsSyncPayload({
        externalTrackId: inferredTrackId,
        projectId: this.config.projectId,
        source: this.config.source,
        parsed,
      }),
    ];
  }
}
