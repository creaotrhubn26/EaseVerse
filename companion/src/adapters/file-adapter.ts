import { readFile, stat } from 'node:fs/promises';
import type { CompanionConfig } from '../config';
import type { ProToolsSyncPayload } from '../types';

function normalizePayload(
  payload: ProToolsSyncPayload,
  defaults: Pick<CompanionConfig, 'projectId' | 'source'>
): ProToolsSyncPayload {
  return {
    ...payload,
    projectId: payload.projectId || defaults.projectId,
    source: payload.source || defaults.source,
    updatedAt: payload.updatedAt || new Date().toISOString(),
  };
}

export class FileProToolsAdapter {
  private lastMtimeMs = 0;

  constructor(private readonly config: CompanionConfig) {}

  async readPendingPayloads(): Promise<ProToolsSyncPayload[]> {
    if (!this.config.exportFilePath) {
      return [];
    }

    const filePath = this.config.exportFilePath;
    const fileStat = await stat(filePath);
    if (fileStat.mtimeMs <= this.lastMtimeMs) {
      return [];
    }

    const raw = await readFile(filePath, 'utf8');
    this.lastMtimeMs = fileStat.mtimeMs;

    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is ProToolsSyncPayload => Boolean(item && typeof item === 'object'))
        .map((item) => normalizePayload(item, this.config));
    }

    if (!parsed || typeof parsed !== 'object') {
      return [];
    }

    return [normalizePayload(parsed as ProToolsSyncPayload, this.config)];
  }
}
