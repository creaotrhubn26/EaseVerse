import test from 'node:test';
import assert from 'node:assert/strict';
import { coachingEvidence, measuredTakeNotes } from '../api/_lib/coaching-evidence';
test('coaching carries actual levels and suppresses ungrounded legacy judgements', () => {
 const x=coachingEvidence({id:'a',filename:'voice.wav',processed_at:'2026-10-20T12:00:00Z',energy_avg_db:-23.3,energy_stddev_db:4.2,timing_score:90,pronunciation_score:99,ai_notes:'Perfect pronunciation',best_take_in_group:true});
 assert.equal(x.energyAvgDb,-23.3);assert.equal(x.energyStddevDb,4.2);assert.equal(x.analysisStatus,'limited');assert.equal(x.timingScore,null);assert.equal(x.pronunciationScore,null);assert.equal(x.aiNotes,null);assert.equal(x.bestInGroup,false);
});
test('missing, nonfinite or unprocessed levels do not become a score or recommendation', () => {
 for(const row of [{},{energy_avg_db:-23},{processed_at:'bad',energy_avg_db:-23},{processed_at:'2026-10-20',energy_avg_db:NaN},{processed_at:'2026-10-20',energy_avg_db:Infinity}]){
  const x=coachingEvidence({id:'a',...row});assert.equal(x.analysisStatus,'unavailable');assert.equal(x.energyAvgDb,null);assert.equal(x.bestInGroup,false);
 }
});
test('a genuine producer decision stays separate from automatic analysis', () => {
 assert.equal(coachingEvidence({id:'a',producer_decision:'keeper'}).decision,'keeper');
 assert.equal(coachingEvidence({id:'a',producer_decision:'ai_best'}).decision,null);
});

test('new take notes are grounded in levels and explicitly refuse unsupported performance judgements', () => {
 assert.match(measuredTakeNotes(-23.3), /-23.3 dBFS/);
 for (const n of [null,NaN,Infinity]) assert.match(measuredTakeNotes(n), /measurement is unavailable/);
 assert.match(measuredTakeNotes(-23.3), /have not been assessed/);
});
