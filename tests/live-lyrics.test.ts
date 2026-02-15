import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveLyricLines, getLiveLyricProgress } from '../lib/live-lyrics';

test('getLiveLyricProgress returns no active indices when transcript is empty', () => {
  const lyrics = 'hello world\nthis is test';
  const progress = getLiveLyricProgress(lyrics, '', 'stability');

  assert.equal(progress.totalWords, 5);
  assert.equal(progress.activeFlatIndex, -1);
  assert.equal(progress.activeLineIndex, -1);
  assert.equal(progress.activeWordIndex, -1);
  assert.equal(progress.confirmedIndices.size, 0);
});

test('buildLiveLyricLines marks confirmed and active words from transcript alignment', () => {
  const lyrics = 'hello world\nthis is test';
  const progress = getLiveLyricProgress(lyrics, 'hello world', 'stability');

  assert.equal(progress.activeFlatIndex, 2);
  assert.equal(progress.activeLineIndex, 1);
  assert.equal(progress.activeWordIndex, 0);

  const lines = buildLiveLyricLines({
    lyrics,
    activeFlatIndex: progress.activeFlatIndex,
    confirmedIndices: progress.confirmedIndices,
    genre: 'pop',
  });

  assert.deepEqual(
    lines[0].words.map((word) => word.state),
    ['confirmed', 'confirmed']
  );
  assert.equal(lines[1].words[0].state, 'active');
});
