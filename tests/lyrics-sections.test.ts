import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSongSections } from '../lib/lyrics-sections';

test('parseSongSections handles duplicate lines without incorrect end-of-song detection', () => {
  let idCounter = 0;
  const createId = () => `sec-${++idCounter}`;
  const lyrics = [
    'Echo in the dark',
    'Same line',
    'Same line',
    'Hold this note',
    'Same line',
    'Same line',
    'Final whisper',
  ].join('\n');

  const sections = parseSongSections(lyrics, createId);

  assert.equal(sections.length, 2);
  assert.deepEqual(sections[0].lines, [
    'Echo in the dark',
    'Same line',
    'Same line',
    'Hold this note',
  ]);
  assert.deepEqual(sections[1].lines, [
    'Same line',
    'Same line',
    'Final whisper',
  ]);
});

test('parseSongSections respects explicit section headers including pre-chorus and final chorus', () => {
  let idCounter = 0;
  const createId = () => `sec-${++idCounter}`;
  const lyrics = [
    '[Verse]',
    'hello world',
    '[Pre-Chorus]',
    'lift it up',
    '[Chorus]',
    'sing it loud',
    '[Bridge]',
    'break it down',
    '[Final Chorus]',
    'final lift',
  ].join('\n');

  const sections = parseSongSections(lyrics, createId);

  assert.deepEqual(
    sections.map((section) => ({
      type: section.type,
      label: section.label,
      lines: section.lines,
    })),
    [
      { type: 'verse', label: 'Verse', lines: ['hello world'] },
      { type: 'pre-chorus', label: 'Pre-Chorus', lines: ['lift it up'] },
      { type: 'chorus', label: 'Chorus', lines: ['sing it loud'] },
      { type: 'bridge', label: 'Bridge', lines: ['break it down'] },
      { type: 'final-chorus', label: 'Final Chorus', lines: ['final lift'] },
    ]
  );
});
