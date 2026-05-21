import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CompanionSnapshot } from '../api';

export interface ExportWriterArgs {
  outputDir: string;
  sessionName?: string;
  sampleRate?: number;
}

function secondsToTimecode(seconds: number, fps = 24): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const f = Math.floor((total - Math.floor(total)) * fps);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
}

function sanitize(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/[\t\r\n]+/g, ' ').slice(0, 80).trim();
}

function buildMemoryLocations(args: {
  markers: CompanionSnapshot['markers'];
  regions: CompanionSnapshot['regions'];
}): string {
  type Entry = { seconds: number; name: string; source: string };
  const entries: Entry[] = [];

  for (const m of args.markers) {
    entries.push({
      seconds: m.seconds,
      name: sanitize(m.label) || `Note · ${sanitize(m.filename)}`,
      source: 'note',
    });
  }
  for (const r of args.regions) {
    const label = sanitize(r.label) || 'Region';
    entries.push({ seconds: r.startSec, name: `[Loop start] ${label}`, source: 'region' });
    entries.push({ seconds: r.endSec, name: `[Loop end] ${label}`, source: 'region' });
  }

  entries.sort((a, b) => a.seconds - b.seconds);

  const header = ['SESSION NAME:\tEaseVerse Markers Export', 'SAMPLE RATE:\t48000', '', 'MEMORY LOCATIONS', '#\tName\tTimecode'];
  const rows = entries.map((e, i) => `${i + 1}\t${e.name}\t${secondsToTimecode(e.seconds)}`);
  return header.concat(rows, ['']).join('\n');
}

function buildKeepersList(snapshot: CompanionSnapshot): string {
  const lines: string[] = [
    'EaseVerse — Producer decisions',
    `Generated: ${new Date().toISOString()}`,
    '',
  ];

  if (snapshot.keepers.length > 0) {
    lines.push('✅ KEEPERS (suggest: colour these tracks green in Pro Tools)');
    for (const k of snapshot.keepers) {
      const locked = k.decisionLockedAt ? ` · 🔒 locked ${k.decisionLockedAt}` : '';
      const path = k.sourcePath ? ` · ${k.sourcePath}` : '';
      lines.push(`  • ${k.filename}${path}${locked}`);
    }
    lines.push('');
  }

  if (snapshot.markers.length > 0) {
    lines.push('📍 PRODUCER NOTES WITH TIMESTAMPS');
    for (const m of snapshot.markers) {
      const tc = secondsToTimecode(m.seconds);
      const label = sanitize(m.label) || '(no comment)';
      lines.push(`  • ${m.filename} @ ${tc} — ${label}`);
    }
    lines.push('');
  }

  if (snapshot.regions.length > 0) {
    lines.push('🔁 LOOP-PUNCH REGIONS');
    for (const r of snapshot.regions) {
      const label = sanitize(r.label) || '(unlabeled)';
      lines.push(`  • ${r.filename} ${secondsToTimecode(r.startSec)} → ${secondsToTimecode(r.endSec)} — ${label}`);
    }
    lines.push('');
  }

  if (lines.length <= 3) {
    lines.push('(No decisions, notes, or regions yet.)');
  }

  lines.push('---');
  lines.push(
    'Import into Pro Tools: File → Import → Session Data → choose easeverse-markers.txt,',
  );
  lines.push(
    'enable "Memory Locations / Markers". Keeper colours and region looping are manual today.',
  );

  return lines.join('\n');
}

export class ProToolsExportWriter {
  private lastMarkersSerialized = '';
  private lastKeepersSerialized = '';

  constructor(private readonly outputDir: string) {}

  async writeIfChanged(snapshot: CompanionSnapshot): Promise<{ markers: boolean; keepers: boolean }> {
    await mkdir(this.outputDir, { recursive: true });
    const markersTxt = buildMemoryLocations({ markers: snapshot.markers, regions: snapshot.regions });
    const keepersTxt = buildKeepersList(snapshot);

    let markersWritten = false;
    if (markersTxt !== this.lastMarkersSerialized) {
      await writeFile(path.join(this.outputDir, 'easeverse-markers.txt'), markersTxt, 'utf8');
      this.lastMarkersSerialized = markersTxt;
      markersWritten = true;
    }

    let keepersWritten = false;
    if (keepersTxt !== this.lastKeepersSerialized) {
      await writeFile(path.join(this.outputDir, 'easeverse-keepers.txt'), keepersTxt, 'utf8');
      this.lastKeepersSerialized = keepersTxt;
      keepersWritten = true;
    }

    return { markers: markersWritten, keepers: keepersWritten };
  }
}
