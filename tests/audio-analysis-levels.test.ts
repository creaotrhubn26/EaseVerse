import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import{analyzeWavBuffer}from'../api/_lib/audio-analysis';
const{WaveFile}=createRequire(import.meta.url)('wavefile');
const sr=48000,samples=Array.from({length:sr},(_,i)=>.1*Math.sin(2*Math.PI*440*i/sr));
function wav(channels:number,data:number[]|number[][]){const w=new WaveFile();w.fromScratch(channels,sr,'32f',data);return w.toBuffer();}
test('mono and stereo levels use actual frames, not interleaved samples as extra duration',()=>{
 for(const[channels,data]of[[1,samples],[2,[samples,samples]]]as const){const x=analyzeWavBuffer(wav(channels,data as number[]|number[][]));assert.equal(x.durationSec,1);assert.ok(Math.abs(x.energyAvgDb! - (-23))<.2);}
});
test('opposite-phase stereo channels retain their real signal energy',()=>{
 const x=analyzeWavBuffer(wav(2,[samples,samples.map(x=>-x)]));assert.equal(x.durationSec,1);assert.ok(Math.abs(x.energyAvgDb! - (-23))<.2);
});
test('silence and unsupported data do not invent vocal measurements',()=>{
 assert.equal(analyzeWavBuffer(wav(1,Array(sr).fill(0))).energyAvgDb,null);
 const x=analyzeWavBuffer(new Uint8Array([1,2,3]));assert.equal(x.durationSec,null);assert.equal(x.energyAvgDb,null);
});
