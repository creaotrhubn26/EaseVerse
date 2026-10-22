import test from 'node:test';
import assert from 'node:assert/strict';
import {createMetronomeController, type MetronomeStart, type MetronomeState} from '../lib/metronome-controller';
import {studioBpm, validBpm} from '../lib/tempo';
const flush = () => new Promise(resolve => setImmediate(resolve));
test('producer tempo overrides stale lyrics, missing values never invent 100 BPM, fractional BPM survives', () => {
  assert.equal(studioBpm({source:'sound-room', bpm:92.5},120),92.5);
  assert.equal(studioBpm({source:'sound-room', bpm:null},120),null);
  assert.equal(studioBpm({source:'sound-room', bpm:92,unavailable:true},120),null);
  for(const v of [undefined, null, '120', NaN, Infinity, 0, 401]) assert.equal(validBpm(v),null);
  assert.equal(validBpm(20),20);
});
test('double tap is idempotent and a producer BPM change cancels old audio before starting new audio', async () => {
  const calls: string[]=[]; const states: MetronomeState[]=[];
  const engine=createMetronomeController(async ({bpm}) => { calls.push(`start:${bpm}`); return {stop:()=>calls.push(`stop:${bpm}`)}; }, s=>states.push(s));
  const a=engine.start(92.5);assert.equal(a,engine.start(92.5));await a;
  await engine.start(110);engine.stop();
  assert.deepEqual(calls,['start:92.5','stop:92.5','start:110','stop:110']);
  assert.equal(states.at(-1)?.status,'idle');
});
test('stop during delayed startup disposes the late audio without starting UI again', async () => {
  let resolve!: (value:{stop:()=>void})=>void;let stopped=0;const states:MetronomeState[]=[];
  const engine=createMetronomeController(()=>new Promise(r=>resolve=r), s=>states.push(s));
  const pending=engine.start(120);await flush();engine.stop();await pending;
  resolve({stop:()=>stopped++});await flush();
  assert.equal(stopped,1);assert.equal(states.at(-1)?.status,'idle');
});
test('startup failure and timeouts are visible and retry works', async () => {
  const states:MetronomeState[]=[];let fail=true;
  const engine=createMetronomeController(async()=>{if(fail)throw new Error('Audio output busy');return {stop(){}};},s=>states.push(s));
  await assert.rejects(engine.start(120),/Audio output busy/);assert.equal(states.at(-1)?.status,'error');
  fail=false;await engine.start(120);assert.equal(states.at(-1)?.status,'playing');engine.stop();
  const timeout=createMetronomeController(()=>new Promise(()=>{}),()=>{},5);
  await assert.rejects(timeout.start(120),/could not start/);timeout.stop();
});
test('native interruption stops the active engine and reports an error after startup', async () => {
  let interrupt!: Parameters<MetronomeStart>[0]['onStopped'];let stopped=0;const states:MetronomeState[]=[];
  const engine=createMetronomeController(async o=>{interrupt=o.onStopped;return {stop:()=>stopped++};},s=>states.push(s));
  await engine.start(120);interrupt('Headphones disconnected');await flush();
  assert.equal(stopped,1);assert.equal(states.at(-1)?.error,'Headphones disconnected');
});
