import {test} from 'node:test';
import assert from 'node:assert/strict';
import {choosePronunciationVoice,playWordPronunciation,type PronunciationBridge,type PronunciationSpeechOptions} from '../lib/word-pronunciation';
const voice={identifier:'en-us-installed',language:'en-US'};
function setup(){let callbacks:PronunciationSpeechOptions;let calls=0,stops=0;const bridge:PronunciationBridge={voices:async()=>[voice],prepare:async()=>{},stop:async()=>{stops++;},speak:(text,options)=>{assert.equal(text,'stars');calls++;callbacks=options;}};return{bridge,get callbacks(){return callbacks;},get calls(){return calls;},get stops(){return stops;}};}
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('selects the requested accent without falling back to a network or wrong-language voice',()=>{
 assert.equal(choosePronunciationVoice([{...voice,localService:false}], 'en-US'),undefined);
 assert.equal(choosePronunciationVoice([voice], 'fr-FR'),undefined);
 assert.equal(choosePronunciationVoice([voice], 'en-GB'),undefined);
 assert.equal(choosePronunciationVoice([voice], 'en'),voice);
 const no={identifier:'norwegian',language:'no-NO'};assert.equal(choosePronunciationVoice([no],'nb-NO'),no);
});
test('only actual start/end callbacks report playing/complete; uses the app audio session',async()=>{
 const f=setup();let started=0;const run=playWordPronunciation('stars','en-US',f.bridge,new AbortController().signal,()=>started++);
 await tick();assert.equal(started,0);assert.equal(f.calls,1);assert.equal(f.callbacks.useApplicationAudioSession,true);assert.equal(f.callbacks.volume,1);assert.equal(f.callbacks.rate,0.8);
 f.callbacks.onStart();assert.equal(started,1);f.callbacks.onDone();assert.equal(await run,voice);
});
test('missing speech voice fails visibly without speaking a different language',async()=>{
 const f=setup();f.bridge.voices=async()=>[];await assert.rejects(playWordPronunciation('stars','en-US',f.bridge,new AbortController().signal,()=>{}),/No speech voice/);assert.equal(f.calls,0);
});
test('engine errors are not silently reported as success and allow a retry',async()=>{
 const f=setup();const run=playWordPronunciation('stars','en-US',f.bridge,new AbortController().signal,()=>{});await tick();f.callbacks.onError(new Error('engine'));await assert.rejects(run,/Could not play/);
 const retry=playWordPronunciation('stars','en-US',f.bridge,new AbortController().signal,()=>{});await tick();f.callbacks.onStart();f.callbacks.onDone();await retry;assert.equal(f.calls,2);
});
test('cancelling while discovering voices prevents any late speech',async()=>{
 const f=setup();let release:(voices:typeof voice[])=>void=()=>{};f.bridge.voices=()=>new Promise(resolve=>release=resolve);const controller=new AbortController();const run=playWordPronunciation('stars','en-US',f.bridge,controller.signal,()=>{});await tick();controller.abort();await assert.rejects(run,/stopped/);release([voice]);await tick();assert.equal(f.calls,0);
});
test('a cancelled old word cannot restart UI or finish a newer request',async()=>{
 const f=setup();let starts=0;const controller=new AbortController();const run=playWordPronunciation('stars','en-US',f.bridge,controller.signal,()=>starts++);await tick();const previous=f.callbacks;controller.abort();await assert.rejects(run,/stopped/);
 const next=playWordPronunciation('stars','en-US',f.bridge,new AbortController().signal,()=>starts++);await tick();previous.onStart();previous.onDone();assert.equal(starts,0);f.callbacks.onStart();f.callbacks.onDone();await next;assert.equal(starts,1);
});
test('hung preparation is bounded and cannot speak after timeout',async()=>{
 const f=setup();let release:()=>void=()=>{};f.bridge.prepare=()=>new Promise(resolve=>release=resolve);
 await assert.rejects(playWordPronunciation('stars','en-US',f.bridge,new AbortController().signal,()=>{},20),/did not respond/);release();await tick();assert.equal(f.calls,0);
});
test('empty or oversized examples are rejected',async()=>{
 const f=setup();for(const value of ['', 'x'.repeat(121)])await assert.rejects(playWordPronunciation(value,'en-US',f.bridge,new AbortController().signal,()=>{}),/Choose a word/);assert.equal(f.calls,0);
});
