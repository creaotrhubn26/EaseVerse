import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDeletionRequestHandler} from '../api/account/deletion-request';
import {createDeletionQueueHandler} from '../api/admin/deletion-requests';
import {safeCreatorHubAuthNextPath} from '../lib/auth-return';
import {CLOUD_PRACTICE_ANALYSIS_ENABLED} from '../lib/release-features';

const response=()=>{const r:any={code:200};r.setHeader=()=>{};r.status=(n:number)=>(r.code=n,r);r.json=(body:unknown)=>(r.body=body,r);return r;};
const request=(overrides:Record<string,unknown>={})=>({method:'POST',headers:{authorization:'Bearer qa-test-session'},body:{confirmation:'DELETE MY ACCOUNT'},...overrides}) as any;
function setup(){const saved:string[][]=[];return {saved,deps:{auth:async()=> 'artist',actor:()=>({id:'artist',email:'artist@example.invalid',name:'Artist'}),save:async(userId:string,email:string)=>{saved.push([userId,email]);return {id:'qa-deletion',requestedAt:'2026-10-22T12:00:00Z',userId,email};}}};}
test('store cloud analysis fails closed unless explicitly built with the enabled flag',()=>assert.equal(CLOUD_PRACTICE_ANALYSIS_ENABLED,process.env.EXPO_PUBLIC_CLOUD_PRACTICE_ANALYSIS_ENABLED==='1'));
test('deletion return resumes only the local screen, without query parameters or external redirects',()=>{
  assert.equal(safeCreatorHubAuthNextPath('/account-deletion?next=https://example.invalid'),'/account-deletion');
  assert.equal(safeCreatorHubAuthNextPath('//example.invalid/account-deletion'),null);
});
test('deletion request uses the session identity and returns a receipt without claiming deletion',async()=>{
  const {saved,deps}=setup();const r=response();await createDeletionRequestHandler(deps)(request({body:{confirmation:'DELETE MY ACCOUNT',userId:'victim',email:'victim@example.invalid'}}),r);
  assert.equal(r.code,202);assert.deepEqual(saved,[['artist','artist@example.invalid']]);
  assert.deepEqual(r.body,{request:{id:'qa-deletion',requestedAt:'2026-10-22T12:00:00Z'},status:'requested'});
});
test('unconfirmed and cross-site deletion requests never reach storage',async()=>{
  const {saved,deps}=setup();
  for(const q of [request({body:{confirmation:'delete'}}),request({headers:{origin:'https://attacker.invalid'}}),request({headers:{}}),request({method:'GET'})]){
    const r=response();await createDeletionRequestHandler(deps)(q,r);assert.ok([400,403,405].includes(r.code));
  }assert.equal(saved.length,0);
});
test('unauthenticated and mismatched actors cannot request deletion',async()=>{
  const {saved,deps}=setup();const r=response();
  await createDeletionRequestHandler({...deps,auth:async(_q:any,res:any)=>{res.status(401).json({error:'sign_in'});return null;}})(request(),r);
  assert.equal(r.code,401);const second=response();await createDeletionRequestHandler({...deps,actor:()=>({...deps.actor(),id:'someone-else'})})(request(),second);
  assert.equal(second.code,401);assert.equal(saved.length,0);
});
test('storage failures do not produce false deletion receipts or leak internal errors',async()=>{
  const {deps}=setup();const r=response();await createDeletionRequestHandler({...deps,save:async()=>{throw Error('private database details');}})(request(),r);
  assert.equal(r.code,503);assert.deepEqual(r.body,{error:'deletion_request_unavailable'});
});
test('deletion queue is admin-only even for an invited or approved artist',async()=>{
  let lists=0;for(const status of ['pending','approved','admin']){const r=response();await createDeletionQueueHandler({auth:async()=> 'artist',user:async()=>({status} as any),list:async()=>{lists++;return [];}})({method:'GET'} as any,r);assert.equal(r.code,status==='admin'?200:403);}assert.equal(lists,1);
});
