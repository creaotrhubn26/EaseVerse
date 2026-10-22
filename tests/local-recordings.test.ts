import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recordingCandidates,preserveRecording,type RecordingFiles} from '../lib/local-recording-paths';
const docs='file:///current/Documents/',cache='file:///current/Library/Caches/';
const old='file:///var/mobile/Containers/Data/Application/OLD/Library/Caches/ExpoAudio/recording-123.m4a';
function fs(existing:string[],failCopy=false){const paths=new Set(existing),copies:string[][]=[];
 const files:RecordingFiles={documents:docs,cache,info:async p=>({exists:paths.has(p)}),mkdir:async()=>{},copy:async(from,to)=>{copies.push([from,to]);if(failCopy)throw Error('Disk full');paths.add(to)}};
 return {files,paths,copies};}
test('relocates an old iOS recording and copies it out of purgeable cache',async()=>{
 const source=cache+'ExpoAudio/recording-123.m4a',target=docs+'easeverse-recordings/recording-123.m4a';const f=fs([source]);
 assert.equal(await preserveRecording(old,f.files),target);assert.deepEqual(f.copies,[[source,target]]);assert.equal(f.paths.has(source),true);
});
test('repairs document paths after another update without copying or losing the original',async()=>{
 const source=docs+'easeverse-recordings/recording-123.m4a',f=fs([source]);
 const oldDocument=old.replace('Library/Caches/ExpoAudio','Documents/easeverse-recordings');
 assert.equal(await preserveRecording(oldDocument,f.files),source);assert.deepEqual(f.copies,[]);
});
test('retains playable source if disk is full and retries safely later',async()=>{
 const source=cache+'ExpoAudio/recording-123.m4a',f=fs([source],true);
 assert.equal(await preserveRecording(old,f.files),source);assert.equal(f.paths.has(source),true);
});
test('missing recordings never become invented working file paths',async()=>{
 const f=fs([]);assert.equal(await preserveRecording(old,f.files),old);assert.equal(f.copies.length,0);
});
test('does not rebase remote URLs, content URIs or path traversal',()=>{
 for(const uri of ['https://example.invalid/a.m4a','content://audio/3','file:///tmp/a.m4a',old.replace('ExpoAudio','%2e%2e')])assert.deepEqual(recordingCandidates(uri,docs,cache),[uri]);
});
test('repairs Android app-cache paths without changing project or server URLs',()=>{
 assert.deepEqual(recordingCandidates('file:///data/user/0/com.easeverse.app/cache/Audio/take.m4a',docs,cache),['file:///data/user/0/com.easeverse.app/cache/Audio/take.m4a',cache+'Audio/take.m4a']);
});
test('two takes with a reused recorder filename retain distinct actual audio',async()=>{
 const source=cache+'ExpoAudio/recording-123.m4a',legacy=docs+'easeverse-recordings/recording-123.m4a';
 const content=new Map([[source,'first take'],[legacy,'older recording']]);
 const files:RecordingFiles={documents:docs,cache,info:async p=>({exists:content.has(p)}),mkdir:async()=>{},copy:async(from,to)=>{content.set(to,content.get(from)!);}};
 const first=await preserveRecording(source,files,'first');
 content.set(source,'second take');
 const second=await preserveRecording(source,files,'second');
 assert.notEqual(first,second);assert.equal(content.get(first),'first take');assert.equal(content.get(second),'second take');
 assert.equal(content.get(legacy),'older recording');
 // Subsequent library hydration preserves the specific take, not the legacy basename.
 assert.equal(await preserveRecording(second,files),second);
});
test('a new-take identity collision never returns an older copy or overwrites it',async()=>{
 const source=cache+'ExpoAudio/new.m4a',target=docs+'easeverse-recordings/take-same.m4a',f=fs([source,target]);
 assert.equal(await preserveRecording(source,f.files,'same'),source);assert.deepEqual(f.copies,[]);
});
