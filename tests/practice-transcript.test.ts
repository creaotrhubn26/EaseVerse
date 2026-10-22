import {test} from 'node:test';
import assert from 'node:assert/strict';
import {usablePracticeTranscript,practiceAudioFormat} from '../shared/practice-transcript';
const good={text:'Hold the tone',no_speech_prob:0.01,avg_logprob:-0.2,compression_ratio:1.1};
test('only usable recogniser segments become recognised words',()=>assert.equal(usablePracticeTranscript({duration:8,segments:[good]}),'Hold the tone'));
test('silence, uncertainty, repetition and missing diagnostics never become a voice score',()=>{for(const segment of [{...good,no_speech_prob:0.95},{...good,avg_logprob:-1.5},{...good,compression_ratio:3},{...good,avg_logprob:NaN}])assert.equal(usablePracticeTranscript({duration:8,segments:[segment]}),'');assert.equal(usablePracticeTranscript({duration:8}), '');});
test('out-of-bounds decoded duration is not accepted from a forged client duration',()=>{assert.equal(usablePracticeTranscript({duration:300,segments:[good]}),'');assert.equal(usablePracticeTranscript({segments:[good]}),'');});
test('private audio upload accepts only supported recording containers',()=>{const wav=Buffer.alloc(100);wav.write('RIFF');wav.write('WAVE',8);assert.equal(practiceAudioFormat(wav),'wav');const mp4=Buffer.alloc(100);mp4.write('ftyp',4);assert.equal(practiceAudioFormat(mp4),'m4a');assert.equal(practiceAudioFormat(Buffer.from([0x1a,0x45,0xdf,0xa3,...new Array(50).fill(0)])),'webm');assert.equal(practiceAudioFormat(Buffer.alloc(100)),null);});
