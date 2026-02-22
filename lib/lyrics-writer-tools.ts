import type { Session, SongSection } from './types';

export type MeterDensity = 'sparse' | 'balanced' | 'tight';

export type MeterLineAnalysis = {
  lineNumber: number;
  text: string;
  syllables: number;
  stressPattern: string;
  density: MeterDensity;
};

export type RhymeGroup = {
  key: string;
  label: string;
  lineNumbers: number[];
  words: string[];
};

export type RhymeMap = {
  endRhymes: RhymeGroup[];
  internalRhymes: RhymeGroup[];
  multis: RhymeGroup[];
};

export type LineLintSeverity = 'info' | 'warn';

export type LineLintIssue = {
  lineNumber: number;
  text: string;
  severity: LineLintSeverity;
  rule: string;
  message: string;
};

export type SectionGoalHint = {
  sectionLabel: string;
  sectionType: SongSection['type'] | 'unknown';
  goal: string;
  guidance: string;
};

export type HookVariant = {
  id: string;
  label: string;
  lyrics: string;
};

export type VersionDiffSummary = {
  addedLines: number;
  removedLines: number;
  changedLines: number;
};

export type SingBackHotspot = {
  lineNumber: number;
  lineText: string;
  focusWord: string;
  reason: string;
  kind: 'pronunciation' | 'timing';
};

const VOWEL_GROUP_RE = /[aeiouy]+/g;
const WORD_RE = /[a-z0-9']+/gi;
const LINE_HEADER_RE = /^\s*\[(verse|pre-chorus|chorus|bridge|final-chorus|intro|outro)\s*\d*\]\s*$/i;
const RHYME_VOWEL_RE = /[aeiouy][a-z]*$/i;
const MAX_VARIANTS = 10;
const DEFAULT_VARIANTS = 6;

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'to',
  'of',
  'in',
  'on',
  'at',
  'for',
  'with',
  'from',
  'my',
  'your',
  'our',
  'their',
  'his',
  'her',
  'its',
  'that',
  'this',
  'is',
  'are',
  'was',
  'were',
]);

const CLICHE_PHRASES = [
  'broken heart',
  'dance all night',
  'fire in my soul',
  'chasing dreams',
  'lost without you',
  'made for each other',
  'forever and always',
  'world on fire',
];

const FILLER_WORDS = new Set([
  'really',
  'very',
  'just',
  'maybe',
  'kinda',
  'sorta',
  'like',
  'literally',
]);

const WEAK_VERBS = new Set(['be', 'is', 'are', 'am', 'was', 'were', 'do', 'does', 'did', 'have', 'has', 'had', 'get', 'go', 'make']);

const STRONG_VERB_SWAP: Record<string, string> = {
  get: 'claim',
  make: 'shape',
  go: 'run',
  have: 'hold',
  do: 'build',
  be: 'stand',
  is: 'stands',
  are: 'stand',
};

const SECTION_GOALS: Record<SongSection['type'], { goal: string; guidance: string }> = {
  intro: {
    goal: 'Set tone and context fast',
    guidance: 'Use one vivid image and a clear emotional color.',
  },
  verse: {
    goal: 'Move the story forward',
    guidance: 'Add concrete details, not abstract summary.',
  },
  'pre-chorus': {
    goal: 'Increase tension',
    guidance: 'Shorten lines and raise urgency into the hook.',
  },
  chorus: {
    goal: 'Deliver the payoff',
    guidance: 'State the central message in memorable language.',
  },
  bridge: {
    goal: 'Create contrast',
    guidance: 'Shift perspective, melody, or imagery before final chorus.',
  },
  'final-chorus': {
    goal: 'Land the biggest emotional hit',
    guidance: 'Escalate wording or add a final signature line.',
  },
  outro: {
    goal: 'Leave a lingering image',
    guidance: 'Resolve or intentionally leave one open-ended phrase.',
  },
};

function normalizeWord(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9']/g, '');
}

function wordsFromLine(line: string): string[] {
  const matches = line.match(WORD_RE);
  if (!matches) {
    return [];
  }
  return matches.map(normalizeWord).filter(Boolean);
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function titleCaseFromHeader(raw: string): string {
  return raw
    .replace(/[\[\]]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^|[\s-])([a-z])/gi, (_, p1: string, p2: string) => `${p1}${p2.toUpperCase()}`);
}

function countSyllablesInWord(word: string): number {
  const normalized = normalizeWord(word);
  if (!normalized) {
    return 0;
  }

  // Common short words get forced to a single beat to avoid zero/over-counting.
  if (normalized.length <= 3) {
    return 1;
  }

  const cleaned = normalized
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/i, '')
    .replace(/^y/i, '');
  const groups = cleaned.match(VOWEL_GROUP_RE);
  return Math.max(1, groups?.length ?? 1);
}

function countSyllablesInLine(line: string): number {
  return wordsFromLine(line).reduce((sum, word) => sum + countSyllablesInWord(word), 0);
}

function buildStressPattern(syllables: number): string {
  if (syllables <= 0) {
    return '-';
  }
  let pattern = '';
  for (let i = 0; i < syllables; i += 1) {
    pattern += i % 2 === 0 ? 'S' : 'u';
    if (i < syllables - 1) {
      pattern += ' ';
    }
  }
  return pattern;
}

function classifyMeterDensity(syllables: number): MeterDensity {
  if (syllables >= 13) {
    return 'tight';
  }
  if (syllables <= 6) {
    return 'sparse';
  }
  return 'balanced';
}

function rhymeKey(word: string): string {
  const normalized = normalizeWord(word);
  if (!normalized) {
    return '';
  }
  const match = normalized.match(RHYME_VOWEL_RE);
  if (match?.[0]) {
    return match[0];
  }
  return normalized.slice(-2);
}

function lineEndingWord(line: string): string {
  const words = wordsFromLine(line);
  if (words.length === 0) {
    return '';
  }
  return words[words.length - 1];
}

function lineEndingMulti(line: string): string {
  const words = wordsFromLine(line);
  if (words.length < 2) {
    return '';
  }
  return `${words[words.length - 2]} ${words[words.length - 1]}`;
}

function mapToSortedGroups(map: Map<string, { lineNumbers: number[]; words: string[] }>): RhymeGroup[] {
  return Array.from(map.entries())
    .filter(([, value]) => value.lineNumbers.length >= 2)
    .map(([key, value]) => ({
      key,
      label: key,
      lineNumbers: value.lineNumbers,
      words: value.words,
    }))
    .sort((a, b) => b.lineNumbers.length - a.lineNumbers.length || a.key.localeCompare(b.key));
}

function tokenizeLines(lyrics: string): string[] {
  return lyrics
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd());
}

export function buildMeterAnalysis(lyrics: string): MeterLineAnalysis[] {
  const lines = tokenizeLines(lyrics);
  return lines
    .map((raw, index) => ({
      lineNumber: index + 1,
      text: normalizeLine(raw),
    }))
    .filter((line) => line.text.length > 0 && !LINE_HEADER_RE.test(line.text))
    .map((line) => {
      const syllables = countSyllablesInLine(line.text);
      return {
        lineNumber: line.lineNumber,
        text: line.text,
        syllables,
        stressPattern: buildStressPattern(syllables),
        density: classifyMeterDensity(syllables),
      };
    });
}

export function buildRhymeMap(lyrics: string): RhymeMap {
  const lines = tokenizeLines(lyrics);
  const endMap = new Map<string, { lineNumbers: number[]; words: string[] }>();
  const internalMap = new Map<string, { lineNumbers: number[]; words: string[] }>();
  const multiMap = new Map<string, { lineNumbers: number[]; words: string[] }>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizeLine(lines[index]);
    if (!line || LINE_HEADER_RE.test(line)) {
      continue;
    }

    const lineNumber = index + 1;
    const ending = lineEndingWord(line);
    const endKey = rhymeKey(ending);
    if (endKey) {
      const existing = endMap.get(endKey) ?? { lineNumbers: [], words: [] };
      existing.lineNumbers.push(lineNumber);
      existing.words.push(ending);
      endMap.set(endKey, existing);
    }

    const endingMulti = lineEndingMulti(line);
    if (endingMulti) {
      const multiKey = endingMulti
        .split(' ')
        .map(rhymeKey)
        .filter(Boolean)
        .join('-');
      if (multiKey) {
        const existing = multiMap.get(multiKey) ?? { lineNumbers: [], words: [] };
        existing.lineNumbers.push(lineNumber);
        existing.words.push(endingMulti);
        multiMap.set(multiKey, existing);
      }
    }

    const words = wordsFromLine(line).filter((word) => word.length >= 3);
    const seenInLine = new Set<string>();
    for (const word of words) {
      const key = rhymeKey(word);
      if (!key || seenInLine.has(`${lineNumber}-${key}`)) {
        continue;
      }
      seenInLine.add(`${lineNumber}-${key}`);
      const existing = internalMap.get(key) ?? { lineNumbers: [], words: [] };
      existing.lineNumbers.push(lineNumber);
      existing.words.push(word);
      internalMap.set(key, existing);
    }
  }

  return {
    endRhymes: mapToSortedGroups(endMap),
    internalRhymes: mapToSortedGroups(internalMap).slice(0, 8),
    multis: mapToSortedGroups(multiMap).slice(0, 8),
  };
}

function openingKey(line: string): string {
  const words = wordsFromLine(line);
  return words.slice(0, 2).join(' ');
}

export function lintLyricsLines(lyrics: string): LineLintIssue[] {
  const lines = tokenizeLines(lyrics);
  const issues: LineLintIssue[] = [];
  const openingUseCount = new Map<string, number>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizeLine(lines[index]);
    if (!line || LINE_HEADER_RE.test(line)) {
      continue;
    }

    const lineNumber = index + 1;
    const lower = line.toLowerCase();
    const words = wordsFromLine(line);

    const opening = openingKey(line);
    if (opening) {
      const nextCount = (openingUseCount.get(opening) ?? 0) + 1;
      openingUseCount.set(opening, nextCount);
      if (nextCount >= 3) {
        issues.push({
          lineNumber,
          text: line,
          severity: 'warn',
          rule: 'repeated-opening',
          message: `Opening repeats ${nextCount} times. Vary the first words for momentum.`,
        });
      }
    }

    const fillerCount = words.filter((word) => FILLER_WORDS.has(word)).length;
    if (fillerCount > 0) {
      issues.push({
        lineNumber,
        text: line,
        severity: 'info',
        rule: 'filler-words',
        message: `Contains ${fillerCount} filler word${fillerCount > 1 ? 's' : ''}. Tighten for punch.`,
      });
    }

    const weakVerbCount = words.filter((word) => WEAK_VERBS.has(word)).length;
    if (weakVerbCount >= 2) {
      issues.push({
        lineNumber,
        text: line,
        severity: 'info',
        rule: 'weak-verbs',
        message: 'Uses multiple generic verbs. Swap one for a more specific action verb.',
      });
    }

    for (const phrase of CLICHE_PHRASES) {
      if (lower.includes(phrase)) {
        issues.push({
          lineNumber,
          text: line,
          severity: 'warn',
          rule: 'cliche-phrase',
          message: `Contains cliche phrase "${phrase}". Consider a fresher image.`,
        });
        break;
      }
    }
  }

  return issues;
}

export function buildSectionGoalHints(lyrics: string): SectionGoalHint[] {
  const lines = tokenizeLines(lyrics);
  const hints: SectionGoalHint[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('[') || !trimmed.endsWith(']')) {
      continue;
    }
    const lower = trimmed.toLowerCase();
    const sectionType = (
      lower.includes('pre-chorus')
        ? 'pre-chorus'
        : lower.includes('final-chorus')
        ? 'final-chorus'
        : lower.includes('chorus')
        ? 'chorus'
        : lower.includes('verse')
        ? 'verse'
        : lower.includes('bridge')
        ? 'bridge'
        : lower.includes('intro')
        ? 'intro'
        : lower.includes('outro')
        ? 'outro'
        : 'unknown'
    ) as SongSection['type'] | 'unknown';

    if (sectionType === 'unknown') {
      continue;
    }

    const meta = SECTION_GOALS[sectionType];
    hints.push({
      sectionLabel: titleCaseFromHeader(trimmed),
      sectionType,
      goal: meta.goal,
      guidance: meta.guidance,
    });
  }

  if (hints.length === 0) {
    return [
      {
        sectionLabel: 'Verse',
        sectionType: 'verse',
        goal: SECTION_GOALS.verse.goal,
        guidance: SECTION_GOALS.verse.guidance,
      },
      {
        sectionLabel: 'Pre-Chorus',
        sectionType: 'pre-chorus',
        goal: SECTION_GOALS['pre-chorus'].goal,
        guidance: SECTION_GOALS['pre-chorus'].guidance,
      },
      {
        sectionLabel: 'Chorus',
        sectionType: 'chorus',
        goal: SECTION_GOALS.chorus.goal,
        guidance: SECTION_GOALS.chorus.guidance,
      },
    ];
  }

  return hints;
}

function stripStopWords(words: string[]): string[] {
  return words.filter((word) => !STOP_WORDS.has(word));
}

function swapWeakVerbs(line: string): string {
  return line.replace(/\b[a-z']+\b/gi, (word) => {
    const lower = word.toLowerCase();
    const replacement = STRONG_VERB_SWAP[lower];
    if (!replacement) {
      return word;
    }
    return /^[A-Z]/.test(word)
      ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
      : replacement;
  });
}

function ensureUniqueVariants(variants: HookVariant[]): HookVariant[] {
  const seen = new Set<string>();
  const deduped: HookVariant[] = [];
  for (const variant of variants) {
    const key = normalizeLine(variant.lyrics).toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(variant);
  }
  return deduped;
}

function extractHookSeedLines(lyrics: string): string[] {
  const lines = tokenizeLines(lyrics);
  const chorusLines: string[] = [];
  let inChorus = false;
  for (const raw of lines) {
    const line = normalizeLine(raw);
    if (!line) {
      if (inChorus && chorusLines.length > 0) {
        break;
      }
      continue;
    }
    if (LINE_HEADER_RE.test(line)) {
      inChorus = /\[.*chorus.*\]/i.test(line);
      continue;
    }
    if (inChorus) {
      chorusLines.push(line);
      if (chorusLines.length >= 4) {
        break;
      }
    }
  }

  if (chorusLines.length > 0) {
    return chorusLines;
  }

  return lines
    .map(normalizeLine)
    .filter((line) => line.length > 0 && !LINE_HEADER_RE.test(line))
    .slice(0, 2);
}

export function generateHookVariants(
  lyrics: string,
  count = DEFAULT_VARIANTS
): HookVariant[] {
  const safeCount = Math.max(1, Math.min(MAX_VARIANTS, count));
  const baseLines = extractHookSeedLines(lyrics);
  if (baseLines.length === 0) {
    return [];
  }

  const baseHook = baseLines.join('\n');
  const keyWords = stripStopWords(wordsFromLine(baseHook)).slice(0, 4);
  const keyPhrase = keyWords.slice(0, 2).join(' ') || wordsFromLine(baseHook).slice(0, 2).join(' ');
  const firstLine = baseLines[0] ?? '';
  const secondLine = baseLines[1] ?? firstLine;
  const compressed = baseLines
    .map((line) => stripStopWords(wordsFromLine(line)).slice(0, 6).join(' '))
    .filter(Boolean)
    .join('\n');

  const rawVariants: HookVariant[] = [
    { id: 'hook-original', label: 'Original', lyrics: baseHook },
    {
      id: 'hook-repeat',
      label: 'Repeat Tag',
      lyrics: `${firstLine}\n${secondLine}\n${keyPhrase}, ${keyPhrase}`,
    },
    {
      id: 'hook-tight',
      label: 'Tight Cut',
      lyrics: compressed || baseHook,
    },
    {
      id: 'hook-punch',
      label: 'Punch Verb',
      lyrics: swapWeakVerbs(baseHook),
    },
    {
      id: 'hook-call-response',
      label: 'Call / Response',
      lyrics: `${firstLine}\n(Yeah, ${keyPhrase})\n${secondLine}`,
    },
    {
      id: 'hook-contrast',
      label: 'Contrast Lift',
      lyrics: `Even when the lights go low\n${firstLine}\n${secondLine}`,
    },
    {
      id: 'hook-rise',
      label: 'Final Rise',
      lyrics: `${firstLine}\n${secondLine}\n${keyPhrase.toUpperCase()}`,
    },
    {
      id: 'hook-whisper',
      label: 'Soft Then Loud',
      lyrics: `(whisper) ${keyPhrase}\n${firstLine}\n${secondLine}`,
    },
  ];

  return ensureUniqueVariants(rawVariants).slice(0, safeCount);
}

export function summarizeVersionDiff(baseLyrics: string, nextLyrics: string): VersionDiffSummary {
  const baseLines = tokenizeLines(baseLyrics).map(normalizeLine);
  const nextLines = tokenizeLines(nextLyrics).map(normalizeLine);

  let addedLines = 0;
  let removedLines = 0;
  let changedLines = 0;

  const maxLength = Math.max(baseLines.length, nextLines.length);
  for (let i = 0; i < maxLength; i += 1) {
    const before = baseLines[i] ?? '';
    const after = nextLines[i] ?? '';
    if (!before && after) {
      addedLines += 1;
      continue;
    }
    if (before && !after) {
      removedLines += 1;
      continue;
    }
    if (before !== after) {
      changedLines += 1;
    }
  }

  return { addedLines, removedLines, changedLines };
}

function findLineNumbersWithWord(lines: string[], word: string): number[] {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(`\\b${escaped}\\b`, 'i');
  const lineNumbers: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizeLine(lines[index]);
    if (!line || LINE_HEADER_RE.test(line)) {
      continue;
    }
    if (matcher.test(line)) {
      lineNumbers.push(index + 1);
    }
  }
  return lineNumbers;
}

export function buildSingBackHotspots(
  lyrics: string,
  sessions: Session[],
  activeSongId?: string
): SingBackHotspot[] {
  if (sessions.length === 0) {
    return [];
  }
  const filteredSessions = activeSongId
    ? sessions.filter((session) => session.songId === activeSongId)
    : sessions;
  const targetSessions = filteredSessions.length > 0 ? filteredSessions : sessions;
  const latest = [...targetSessions].sort((a, b) => b.date - a.date)[0];
  if (!latest) {
    return [];
  }

  const lines = tokenizeLines(lyrics);
  const hotspots: SingBackHotspot[] = [];

  for (const fix of latest.insights.topToFix.slice(0, 6)) {
    const lineNumbers = findLineNumbersWithWord(lines, fix.word);
    for (const lineNumber of lineNumbers) {
      const lineText = normalizeLine(lines[lineNumber - 1] ?? '');
      if (!lineText) {
        continue;
      }
      hotspots.push({
        lineNumber,
        lineText,
        focusWord: fix.word,
        reason: fix.reason,
        kind: 'pronunciation',
      });
    }
  }

  if (latest.insights.timingConsistency === 'low') {
    let candidateLines = buildMeterAnalysis(lyrics)
      .filter((line) => line.density === 'tight')
      .slice(0, 3);

    if (candidateLines.length === 0) {
      candidateLines = buildMeterAnalysis(lyrics).slice(0, 2);
    }

    for (const line of candidateLines) {
      hotspots.push({
        lineNumber: line.lineNumber,
        lineText: line.text,
        focusWord: line.text.split(' ').slice(0, 2).join(' '),
        reason: 'Timing consistency was low. Rehearse this line with count-in.',
        kind: 'timing',
      });
    }
  }

  const seen = new Set<string>();
  return hotspots.filter((spot) => {
    const key = `${spot.kind}-${spot.lineNumber}-${spot.focusWord.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

type ExportOptions = {
  title: string;
  lyrics: string;
  genre?: string;
  bpm?: number;
  includeLineNumbers?: boolean;
  includeHeaders?: boolean;
  generatedAt?: Date;
};

export function buildLyricsExportText(options: ExportOptions): string {
  const generatedAt = options.generatedAt ?? new Date();
  const lines = tokenizeLines(options.lyrics);

  const header: string[] = [];
  header.push(options.title || 'Untitled');
  if (options.genre) {
    header.push(`Genre: ${options.genre}`);
  }
  if (typeof options.bpm === 'number' && Number.isFinite(options.bpm)) {
    header.push(`Tempo: ${Math.round(options.bpm)} BPM`);
  }
  header.push(`Generated: ${generatedAt.toISOString()}`);
  header.push('');

  const body = lines
    .map((line) => {
      const normalized = line.trimEnd();
      if (!options.includeHeaders && LINE_HEADER_RE.test(normalized)) {
        return '';
      }
      return normalized;
    })
    .map((line, index) => {
      if (!options.includeLineNumbers || !line.trim()) {
        return line;
      }
      return `${String(index + 1).padStart(2, '0')}. ${line}`;
    })
    .join('\n');

  return `${header.join('\n')}${body}`.trimEnd();
}

export function lineNumberToCursorIndex(lyrics: string, lineNumber: number): number {
  const lines = lyrics.replace(/\r\n/g, '\n').split('\n');
  let cursor = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (index + 1 === lineNumber) {
      return cursor;
    }
    cursor += lines[index].length + 1;
  }
  return Math.max(0, lyrics.length);
}
