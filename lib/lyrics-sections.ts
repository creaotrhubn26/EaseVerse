import type { SongSection } from './types';
import { generateId } from './storage';

type CreateId = () => string;

export function parseSongSections(
  text: string,
  createId: CreateId = generateId
): SongSection[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

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

    sections.push({
      id: createId(),
      type,
      label,
      lines: [...currentLines],
    });
    currentLines = [];
  }

  return sections;
}
