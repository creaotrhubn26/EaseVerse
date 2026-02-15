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

test('lyrics follow speed changes how aggressively live lyrics advance in speed mode', () => {
  const lyrics = 'a b c d e f g';
  const transcript = 'a c d e';

  const slow = getLiveLyricProgress(lyrics, transcript, 'speed', 'slow');
  const normal = getLiveLyricProgress(lyrics, transcript, 'speed', 'normal');
  const fast = getLiveLyricProgress(lyrics, transcript, 'speed', 'fast');

  assert.equal(slow.activeFlatIndex, 1);
  assert.equal(normal.activeFlatIndex, 5);
  assert.equal(fast.activeFlatIndex, 5);

  const slowLines = buildLiveLyricLines({
    lyrics,
    activeFlatIndex: slow.activeFlatIndex,
    confirmedIndices: slow.confirmedIndices,
  });
  assert.deepEqual(
    slowLines[0].words.map((w) => w.state),
    ['confirmed', 'active', 'confirmed', 'confirmed', 'confirmed', 'upcoming', 'upcoming']
  );

  const normalLines = buildLiveLyricLines({
    lyrics,
    activeFlatIndex: normal.activeFlatIndex,
    confirmedIndices: normal.confirmedIndices,
  });
  assert.deepEqual(
    normalLines[0].words.map((w) => w.state),
    ['confirmed', 'unclear', 'confirmed', 'confirmed', 'confirmed', 'active', 'upcoming']
  );
});
