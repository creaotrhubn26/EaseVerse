import assert from 'node:assert/strict';
import test from 'node:test';
import { canSetProjectTempo } from '../api/_lib/producer-tempo-permissions';

test('only the actual project producer can write tempo; artist, band, engineer and observer cannot', async()=>{
  for (const role of ['producer','vocalist','band_member','mix_engineer','observer']) {
    const calls:unknown[]=[];
    const allowed=await canSetProjectTempo('room-1','actor',async(projectId,userId)=>{
      calls.push([projectId,userId]);return {role};
    });
    assert.equal(allowed,role==='producer');assert.deepEqual(calls,[['room-1','actor']]);
  }
});
test('missing project or membership never gives session owner implicit producer access',async()=>{
  let reads=0;
  const missing=async()=>{reads++;return null;};
  assert.equal(await canSetProjectTempo(undefined,'actor',missing),false);
  assert.equal(await canSetProjectTempo('','actor',missing),false);
  assert.equal(await canSetProjectTempo('room','',missing),false);
  assert.equal(reads,0);
  assert.equal(await canSetProjectTempo('room','session-owner',missing),false);
  assert.equal(reads,1);
});
