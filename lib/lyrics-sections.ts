import type { SongSection } from './types';
import { generateId } from './storage';

type CreateId = () => string;
type ExplicitHeader = {
  type: SongSection['type'];
  explicitLabel: string;
  explicitNumber: number | null;
};

const BASE_LABELS: Record<SongSection['type'], string> = {
  verse: 'Verse',
  'pre-chorus': 'Pre-Chorus',
  chorus: 'Chorus',
  bridge: 'Bridge',
  'final-chorus': 'Final Chorus',
  intro: 'Intro',
  outro: 'Outro',
};

const REPEATABLE_TYPES = new Set<SongSection['type']>([
  'verse',
  'pre-chorus',
  'chorus',
  'bridge',
]);

function parseSectionHeader(line: string): ExplicitHeader | null {
  let token = line.trim();
  if (!token) {
    return null;
  }
  if (token.startsWith('[') && token.endsWith(']')) {
    token = token.slice(1, -1).trim();
  }
  token = token.replace(/[:\-]+$/, '').trim();

  const match = token.match(
    /^(verse|pre[- ]?chorus|chorus|bridge|final[- ]?chorus|intro|outro)(?:\s+(\d+))?$/i
  );
  if (!match) {
    return null;
  }

  const rawType = match[1].toLowerCase().replace(/\s+/g, '-');
  const normalizedType =
    rawType === 'pre-chorus' || rawType === 'prechorus'
      ? 'pre-chorus'
      : rawType === 'final-chorus' || rawType === 'finalchorus'
      ? 'final-chorus'
      : rawType;

  if (!(normalizedType in BASE_LABELS)) {
    return null;
  }

  const type = normalizedType as SongSection['type'];
  const explicitNumber =
    typeof match[2] === 'string' ? Number.parseInt(match[2], 10) : null;
  const explicitLabel = explicitNumber
    ? `${BASE_LABELS[type]} ${explicitNumber}`
    : BASE_LABELS[type];

  return {
    type,
    explicitLabel,
    explicitNumber,
  };
}

function createSection(
  createId: CreateId,
  type: SongSection['type'],
  label: string,
  lines: string[]
): SongSection {
  return {
    id: createId(),
    type,
    label,
    lines: [...lines],
  };
}

export function parseSongSections(
  text: string,
  createId: CreateId = generateId
): SongSection[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const hasExplicitHeaders = lines.some((line) => parseSectionHeader(line) !== null);

  if (hasExplicitHeaders) {
    const sections: SongSection[] = [];
    const sectionCounters: Record<SongSection['type'], number> = {
      verse: 0,
      'pre-chorus': 0,
      chorus: 0,
      bridge: 0,
      'final-chorus': 0,
      intro: 0,
      outro: 0,
    };

    let currentType: SongSection['type'] | null = null;
    let currentLabel: string | null = null;
    let currentLines: string[] = [];

    const flushCurrentSection = () => {
      if (!currentType || currentLines.length === 0) {
        return;
      }
      sections.push(createSection(createId, currentType, currentLabel || BASE_LABELS[currentType], currentLines));
      currentLines = [];
    };

    for (const line of lines) {
      const header = parseSectionHeader(line);
      if (header) {
        flushCurrentSection();
        currentType = header.type;

        if (header.explicitNumber !== null) {
          sectionCounters[currentType] = Math.max(
            sectionCounters[currentType],
            header.explicitNumber
          );
          currentLabel = header.explicitLabel;
        } else {
          sectionCounters[currentType] += 1;
          const count = sectionCounters[currentType];
          const baseLabel = BASE_LABELS[currentType];
          currentLabel =
            REPEATABLE_TYPES.has(currentType) && count > 1
              ? `${baseLabel} ${count}`
              : baseLabel;
        }
        continue;
      }

      if (!currentType) {
        currentType = 'verse';
        sectionCounters.verse += 1;
        currentLabel = sectionCounters.verse > 1 ? `Verse ${sectionCounters.verse}` : 'Verse';
      }
      currentLines.push(line);
    }

    flushCurrentSection();
    return sections;
  }

  const sections: SongSection[] = [];
  let currentLines: string[] = [];
  let sectionCount = 0;
  let verseCount = 0;
  for (let index = 0; index < lines.length; index += 1) {
    currentLines.push(lines[index]);
    const isSectionBoundary = currentLines.length === 4 || index === lines.length - 1;
    if (!isSectionBoundary) {
      continue;
    }

    sectionCount += 1;
    const type =
      sectionCount % 3 === 2 ? 'chorus' : sectionCount % 3 === 0 ? 'bridge' : 'verse';

    let label: string;
    if (type === 'verse') {
      verseCount += 1;
      label = `Verse ${verseCount}`;
    } else if (type === 'chorus') {
      label = 'Chorus';
    } else {
      label = 'Bridge';
    }

    sections.push(createSection(createId, type, label, currentLines));
    currentLines = [];
  }

  return sections;
}
