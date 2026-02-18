import type { ProToolsMarker, ProToolsSectionType, ProToolsSyncPayload } from '../types';

export interface ParsedSessionInfo {
  sessionName?: string;
  bpm?: number;
  markers: ProToolsMarker[];
}

function inferSectionType(label: string): ProToolsSectionType | undefined {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes('pre-chorus') || normalized.includes('pre chorus')) return 'pre-chorus';
  if (normalized.includes('final chorus')) return 'final-chorus';
  if (normalized.includes('chorus')) return 'chorus';
  if (normalized.includes('verse')) return 'verse';
  if (normalized.includes('bridge')) return 'bridge';
  if (normalized.includes('intro')) return 'intro';
  if (normalized.includes('outro')) return 'outro';
  return undefined;
}

function decodeSessionInfo(buffer: Buffer): string {
  if (buffer.length >= 2) {
    const b0 = buffer[0];
    const b1 = buffer[1];
    if (b0 === 0xff && b1 === 0xfe) {
      return buffer.subarray(2).toString('utf16le');
    }
    if (b0 === 0xfe && b1 === 0xff) {
      const swapped = Buffer.allocUnsafe(buffer.length - 2);
      for (let index = 2; index < buffer.length; index += 2) {
        const outIndex = index - 2;
        if (index + 1 < buffer.length) {
          swapped[outIndex] = buffer[index + 1];
          swapped[outIndex + 1] = buffer[index];
        }
      }
      return swapped.toString('utf16le');
    }
  }
  return buffer.toString('utf8');
}

function parseTimeToMs(token: string): number | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.round(numeric * 1000));
  }

  const parts = trimmed.split(':').map((part) => part.trim());
  if (parts.some((part) => part.length === 0)) {
    return null;
  }

  if (parts.length === 4) {
    const [hhRaw, mmRaw, ssRaw, ffRaw] = parts;
    const hh = Number(hhRaw);
    const mm = Number(mmRaw);
    const ss = Number(ssRaw);
    const ff = Number(ffRaw);
    if (![hh, mm, ss, ff].every((value) => Number.isFinite(value))) {
      return null;
    }
    const baseSeconds = hh * 3600 + mm * 60 + ss;
    const fps = 30;
    return Math.max(0, Math.round((baseSeconds + ff / fps) * 1000));
  }

  if (parts.length === 3) {
    const [hhRaw, mmRaw, ssRaw] = parts;
    const hh = Number(hhRaw);
    const mm = Number(mmRaw);
    const ss = Number(ssRaw);
    if (![hh, mm, ss].every((value) => Number.isFinite(value))) {
      return null;
    }
    return Math.max(0, Math.round((hh * 3600 + mm * 60 + ss) * 1000));
  }

  if (parts.length === 2) {
    const [mmRaw, ssRaw] = parts;
    const mm = Number(mmRaw);
    const ss = Number(ssRaw);
    if (![mm, ss].every((value) => Number.isFinite(value))) {
      return null;
    }
    return Math.max(0, Math.round((mm * 60 + ss) * 1000));
  }

  return null;
}

function parseSessionName(text: string): string | undefined {
  const patterns = [
    /session\s*name\s*[:\t]\s*(.+)$/im,
    /^\s*session\s*[:\t]\s*(.+)$/im,
    /^\s*session\s+name\s*[-:]\s*(.+)$/im,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return undefined;
}

function parseBpm(lines: string[]): number | undefined {
  const candidates: number[] = [];
  let inTempoSection = false;

  for (const line of lines) {
    const normalized = line.trim().toLowerCase();
    if (!normalized) {
      inTempoSection = false;
      continue;
    }

    if (
      normalized.includes('tempo map') ||
      normalized.includes('tempo events') ||
      normalized.includes('meter/tempo')
    ) {
      inTempoSection = true;
    }

    const bpmTagged = line.match(/\b([4-9]\d|[1-2]\d{2})(?:\.\d+)?\s*bpm\b/gi);
    if (bpmTagged) {
      for (const token of bpmTagged) {
        const numeric = Number(token.toLowerCase().replace('bpm', '').trim());
        if (Number.isFinite(numeric) && numeric >= 40 && numeric <= 300) {
          candidates.push(Math.round(numeric));
        }
      }
    }

    if (inTempoSection || normalized.includes('tempo')) {
      for (const rawToken of line.split(/[\s\t|,;]+/)) {
        if (!rawToken || !/^\d+(?:\.\d+)?$/.test(rawToken)) {
          continue;
        }
        const numeric = Number(rawToken);
        if (numeric >= 40 && numeric <= 300) {
          candidates.push(Math.round(numeric));
        }
      }
    }
  }

  return candidates.find((value) => Number.isFinite(value));
}

function parseMarkerLine(line: string, indexHint: number): ProToolsMarker | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();
  if (
    lowered.includes('marker id') ||
    lowered === 'markers' ||
    lowered.includes('memory locations') ||
    lowered.includes('location name')
  ) {
    return null;
  }

  const patternA = line.match(/marker\s*#?\s*(\d+)?\s*[:\-\t ]+(.+?)\s+[\-\t ]+([0-9:.]+)\s*$/i);
  if (patternA) {
    const id = patternA[1] || `${indexHint}`;
    const label = (patternA[2] || '').trim();
    const positionMs = parseTimeToMs(patternA[3] || '');
    if (label && positionMs !== null) {
      return {
        id: `m-${id}`,
        label: label.slice(0, 160),
        positionMs,
        sectionType: inferSectionType(label),
      };
    }
  }

  const patternB = line.match(/^\s*(\d+)\s+[\t ]+([^\t]+?)\s+[\t ]+([0-9:.]+)\s*$/);
  if (patternB) {
    const label = (patternB[2] || '').trim();
    const positionMs = parseTimeToMs(patternB[3] || '');
    if (label && positionMs !== null) {
      return {
        id: `m-${patternB[1]}`,
        label: label.slice(0, 160),
        positionMs,
        sectionType: inferSectionType(label),
      };
    }
  }

  const timeToken = line.match(/\b(\d{1,2}:\d{2}:\d{2}(?::\d{2})?)\b|\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
  if (timeToken) {
    const timeRaw = (timeToken[1] || timeToken[2] || '').trim();
    const positionMs = parseTimeToMs(timeRaw);
    if (positionMs !== null) {
      const label = line.replace(timeRaw, '').replace(/[\t|\-]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (label && /[A-Za-z]/.test(label)) {
        return {
          id: `m-${indexHint}`,
          label: label.slice(0, 160),
          positionMs,
          sectionType: inferSectionType(label),
        };
      }
    }
  }

  return null;
}

function parseMarkers(lines: string[]): ProToolsMarker[] {
  const markers: ProToolsMarker[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const marker = parseMarkerLine(lines[index] || '', index + 1);
    if (marker) {
      markers.push(marker);
    }
  }

  const deduped = new Map<string, ProToolsMarker>();
  for (const marker of markers) {
    const key = `${marker.label.toLowerCase()}::${marker.positionMs}`;
    if (!deduped.has(key)) {
      deduped.set(key, marker);
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => a.positionMs - b.positionMs)
    .slice(0, 500);
}

export function parseProToolsSessionInfoText(text: string): ParsedSessionInfo {
  const lines = text.split(/\r?\n/);
  return {
    sessionName: parseSessionName(text),
    bpm: parseBpm(lines),
    markers: parseMarkers(lines),
  };
}

export function parseProToolsSessionInfoBuffer(buffer: Buffer): ParsedSessionInfo {
  const text = decodeSessionInfo(buffer);
  return parseProToolsSessionInfoText(text);
}

export function toProToolsSyncPayload(input: {
  externalTrackId: string;
  projectId?: string;
  source: string;
  parsed: ParsedSessionInfo;
}): ProToolsSyncPayload {
  return {
    externalTrackId: input.externalTrackId,
    projectId: input.projectId,
    source: input.source,
    bpm: input.parsed.bpm,
    markers: input.parsed.markers,
    updatedAt: new Date().toISOString(),
  };
}
