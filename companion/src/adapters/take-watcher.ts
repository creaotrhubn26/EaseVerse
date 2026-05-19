import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CompanionConfig } from '../config';

type SeenEntry = { size: number; mtimeMs: number; stableSince: number; uploaded: boolean };

const seen = new Map<string, SeenEntry>();

export type PendingTake = {
  absolutePath: string;
  filename: string;
  size: number;
};

export async function scanAudioFolder(config: CompanionConfig): Promise<PendingTake[]> {
  const root = config.audioWatchPath;
  if (!root) return [];

  let entries: string[];
  try {
    entries = await readdir(root);
  } catch (error) {
    if (config.logVerbose) {
      console.warn('[companion] audio watch readdir failed', { root, error: (error as Error).message });
    }
    return [];
  }

  const now = Date.now();
  const pending: PendingTake[] = [];

  for (const entry of entries) {
    const ext = path.extname(entry).toLowerCase();
    if (!config.audioExtensions.includes(ext)) continue;
    if (entry.startsWith('.')) continue;

    const absolutePath = path.join(root, entry);
    let info;
    try {
      info = await stat(absolutePath);
    } catch {
      continue;
    }
    if (!info.isFile()) continue;

    const prev = seen.get(absolutePath);
    if (!prev) {
      seen.set(absolutePath, {
        size: info.size,
        mtimeMs: info.mtimeMs,
        stableSince: now,
        uploaded: false,
      });
      continue;
    }

    if (prev.uploaded) continue;

    if (info.size !== prev.size || info.mtimeMs !== prev.mtimeMs) {
      seen.set(absolutePath, {
        size: info.size,
        mtimeMs: info.mtimeMs,
        stableSince: now,
        uploaded: false,
      });
      continue;
    }

    if (now - prev.stableSince >= config.audioStabilizeMs) {
      pending.push({ absolutePath, filename: entry, size: info.size });
    }
  }

  return pending;
}

export function markUploaded(absolutePath: string): void {
  const entry = seen.get(absolutePath);
  if (entry) entry.uploaded = true;
}

export async function readTakeBytes(absolutePath: string): Promise<Buffer> {
  return readFile(absolutePath);
}
