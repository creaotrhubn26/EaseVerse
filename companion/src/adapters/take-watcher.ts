import { readdir, stat, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { CompanionConfig } from '../config';

type SeenEntry = { size: number; mtimeMs: number; stableSince: number; uploaded: boolean };

const seen = new Map<string, SeenEntry>();
const stateFile = path.join(os.homedir(), '.easeverse-companion', 'seen.json');

// Pro Tools writes a lot of derived files alongside the actual takes. Skip
// them so we don't upload fade renders, undo snapshots, or temp scratch.
const PROTOOLS_INTERNAL_PREFIXES = ['.', '~', '#'];
const PROTOOLS_INTERNAL_SUBSTRINGS = [
  'fade',
  'wavecache',
  'autosave',
  'reverse',
  'session file backups',
  '.tmp',
];

function isProToolsInternal(filename: string): boolean {
  const lower = filename.toLowerCase();
  if (PROTOOLS_INTERNAL_PREFIXES.some((p) => filename.startsWith(p))) return true;
  return PROTOOLS_INTERNAL_SUBSTRINGS.some((s) => lower.includes(s));
}

let stateLoaded = false;

async function loadState(): Promise<void> {
  if (stateLoaded) return;
  stateLoaded = true;
  try {
    const raw = await readFile(stateFile, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, SeenEntry>;
    for (const [key, value] of Object.entries(parsed)) seen.set(key, value);
  } catch {
    // First run or no state file yet.
  }
}

async function persistState(): Promise<void> {
  try {
    await mkdir(path.dirname(stateFile), { recursive: true });
    const snapshot: Record<string, SeenEntry> = {};
    for (const [key, value] of seen.entries()) {
      if (value.uploaded) snapshot[key] = value;
    }
    await writeFile(stateFile, JSON.stringify(snapshot, null, 2), 'utf-8');
  } catch (error) {
    console.warn('[companion] could not persist seen-state', (error as Error).message);
  }
}

export type PendingTake = {
  absolutePath: string;
  filename: string;
  size: number;
};

export async function scanAudioFolder(config: CompanionConfig): Promise<PendingTake[]> {
  const root = config.audioWatchPath;
  if (!root) return [];

  await loadState();

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
    if (isProToolsInternal(entry)) continue;

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

export async function markUploaded(absolutePath: string): Promise<void> {
  const entry = seen.get(absolutePath);
  if (entry) {
    entry.uploaded = true;
    await persistState();
  }
}

export async function readTakeBytes(absolutePath: string): Promise<Buffer> {
  return readFile(absolutePath);
}
