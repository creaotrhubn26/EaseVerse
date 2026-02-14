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
