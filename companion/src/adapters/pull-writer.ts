import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { CollabLyricsItem } from '../api';
import type { ProToolsSyncRecord } from '../types';

export interface PullSnapshot {
  pulledAt: string;
  protools: ProToolsSyncRecord[];
  lyrics: CollabLyricsItem[];
}

export class PullSnapshotWriter {
  private lastSerialized = '';

  constructor(private readonly outputPath: string) {}

  async writeIfChanged(snapshot: PullSnapshot): Promise<boolean> {
    const serialized = JSON.stringify(snapshot, null, 2);
    if (serialized === this.lastSerialized) {
      return false;
    }

    await mkdir(dirname(this.outputPath), { recursive: true });
    await writeFile(this.outputPath, serialized, 'utf8');
    this.lastSerialized = serialized;
    return true;
  }
}
