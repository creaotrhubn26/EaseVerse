import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionScoring } from '../shared/session-scoring';

test('buildSessionScoring returns perfect scores on exact match', () => {
  const result = buildSessionScoring({
    expectedLyrics: 'hello from the other side',
    transcript: 'hello from the other side',
    durationSeconds: 5,
  });

  assert.equal(result.matchedWordCount, 5);
  assert.equal(result.insights.textAccuracy, 100);
  assert.equal(result.insights.pronunciationClarity, 100);
  assert.equal(result.insights.timingConsistency, 'high');
});

test('buildSessionScoring flags missed words and lowers scores', () => {
  const result = buildSessionScoring({
    expectedLyrics: 'we were both young when i first saw you',
    transcript: 'we were young when i saw you',
    durationSeconds: 8,
  });

  assert.equal(result.expectedWordCount, 9);
  assert.equal(result.spokenWordCount, 7);
  assert.ok(result.insights.textAccuracy < 100);
  assert.ok(result.insights.pronunciationClarity < 100);
  assert.ok(result.insights.topToFix.length > 0);
  assert.ok(result.insights.topToFix.some((item) => item.word === 'both'));
});
