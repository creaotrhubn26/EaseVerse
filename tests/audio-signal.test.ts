import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hasAudibleSignal} from '../shared/audio-signal';
test('empty, silent, near-zero and invalid samples do not reach a speech recogniser',()=>{for(const samples of [[],[0,0,0],[1e-9,-1e-9],[NaN,0]])assert.equal(hasAudibleSignal(Float32Array.from(samples)),false);});
test('positive and negative audible signals pass without claiming they contain words',()=>{assert.equal(hasAudibleSignal(Float32Array.from([0,0.1,-0.1,0])),true);});
