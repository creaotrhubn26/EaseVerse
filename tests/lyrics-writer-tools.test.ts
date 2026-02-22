import test from 'node:test';
import assert from 'node:assert/strict';
import type { Session } from '../lib/types';
import {
  buildMeterAnalysis,
  buildRhymeMap,
  lintLyricsLines,
  buildSectionGoalHints,
  generateHookVariants,
  summarizeVersionDiff,
  buildSingBackHotspots,
  buildLyricsExportText,
  lineNumberToCursorIndex,
} from '../lib/lyrics-writer-tools';

test('buildMeterAnalysis returns syllable and stress metadata', () => {
  const analysis = buildMeterAnalysis('[Verse]\nHello from the other side');
  assert.equal(analysis.length, 1);
  assert.equal(analysis[0].lineNumber, 2);
  assert.ok(analysis[0].syllables >= 5);
  assert.match(analysis[0].stressPattern, /S/);
});

test('buildRhymeMap groups end and internal rhymes', () => {
  const lyrics = 'I rise in the light\nI write through the night\nI fight for the light';
  const map = buildRhymeMap(lyrics);
  assert.ok(map.endRhymes.some((group) => group.lineNumbers.length >= 2));
  assert.ok(map.internalRhymes.length >= 1);
});

test('lintLyricsLines reports cliches and filler', () => {
  const issues = lintLyricsLines('My broken heart is really really cold');
  assert.ok(issues.some((issue) => issue.rule === 'cliche-phrase'));
  assert.ok(issues.some((issue) => issue.rule === 'filler-words'));
});

test('buildSectionGoalHints falls back and parses explicit headers', () => {
  const explicit = buildSectionGoalHints('[Verse]\nLine\n[Chorus]\nHook');
  assert.ok(explicit.some((goal) => goal.sectionType === 'verse'));
  assert.ok(explicit.some((goal) => goal.sectionType === 'chorus'));

  const fallback = buildSectionGoalHints('Line without headers');
  assert.ok(fallback.length >= 3);
});

test('generateHookVariants creates multiple unique options', () => {
  const variants = generateHookVariants('[Chorus]\nHold the fire\nHold the fire', 8);
  assert.ok(variants.length >= 4);
  const unique = new Set(variants.map((variant) => variant.lyrics.trim().toLowerCase()));
  assert.equal(unique.size, variants.length);
});

test('summarizeVersionDiff counts line-level changes', () => {
  const diff = summarizeVersionDiff('Line A\nLine B', 'Line A\nLine C\nLine D');
  assert.equal(diff.changedLines, 1);
  assert.equal(diff.addedLines, 1);
  assert.equal(diff.removedLines, 0);
});

test('buildSingBackHotspots maps insights to lyric lines', () => {
  const session: Session = {
    id: 's1',
    songId: 'song-1',
    title: 'Test',
    duration: 10,
    date: Date.now(),
    tags: [],
    favorite: false,
    lyrics: 'I am running fast\nI hold the line',
    transcript: '',
    insights: {
      textAccuracy: 70,
      pronunciationClarity: 65,
      timingConsistency: 'low',
      topToFix: [{ word: 'hold', reason: 'Consonant clarity' }],
    },
  };
  const spots = buildSingBackHotspots(session.lyrics, [session], 'song-1');
  assert.ok(spots.some((spot) => spot.focusWord.toLowerCase() === 'hold'));
  assert.ok(spots.some((spot) => spot.kind === 'timing'));
});

test('buildLyricsExportText produces numbered rehearsal copy', () => {
  const output = buildLyricsExportText({
    title: 'Song',
    lyrics: '[Verse]\nHello world',
    includeLineNumbers: true,
    includeHeaders: true,
    generatedAt: new Date('2026-02-22T00:00:00.000Z'),
  });
  assert.match(output, /Song/);
  assert.match(output, /Generated: 2026-02-22T00:00:00.000Z/);
  assert.match(output, /02\. Hello world/);
});

test('lineNumberToCursorIndex jumps to expected line', () => {
  const lyrics = 'Line one\nLine two\nLine three';
  const cursor = lineNumberToCursorIndex(lyrics, 3);
  assert.equal(lyrics.slice(cursor), 'Line three');
});
