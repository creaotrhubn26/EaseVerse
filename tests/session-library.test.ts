import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionLyricMatch,selectLibrarySessions} from '../lib/session-library';
import type {Session} from '../lib/types';
const take=(id:string,date:number,score:number,lyrics='Hold the tone',favorite=false):Session=>({id,title:id,date,duration:8,lyrics,favorite,tags:['Studio'],genre:'pop',insights:{textAccuracy:score,pronunciationClarity:80,timingConsistency:'medium',topToFix:[]}});
test('lyric matching excludes voice memos and invalid scores from ranking',()=>{
  for(const session of [take('memo',3,100,''),take('nan',2,NaN),take('high',2,101),take('negative',2,-1)])assert.equal(sessionLyricMatch(session),null);
  assert.equal(sessionLyricMatch(take('zero',1,0)),0);
  const source=[take('chorus',1,80),take('verse',2,91),take('memo',3,100,'')];
  assert.deepEqual(selectLibrarySessions(source,'match','').map(x=>x.id),['verse','chorus','memo']);
  assert.deepEqual(source.map(x=>x.id),['chorus','verse','memo']);
});
test('library search, favorites and latest preserve useful local ordering',()=>{
  const source=[take('Chorus',1,80,'words',true),take('Verse',2,80),take('Memo',3,100,'')];
  assert.deepEqual(selectLibrarySessions(source,'latest','  STUDIO ').map(x=>x.id),['Memo','Verse','Chorus']);
  assert.deepEqual(selectLibrarySessions(source,'favorites','chor').map(x=>x.id),['Chorus']);
  assert.deepEqual(selectLibrarySessions(source,'match','verse').map(x=>x.id),['Verse']);
});

test('unavailable analysis is not displayed or sorted as a measured zero',()=>{const s=take('no-analysis',1,0);s.insights.analysisAvailable=false;assert.equal(sessionLyricMatch(s),null);});
