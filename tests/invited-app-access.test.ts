import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurrentUserHandler } from '../api/users/me.js';
function response() { const r:any={code:200};r.setHeader=()=>{};r.status=(n:number)=>(r.code=n,r);r.json=(body:any)=>(r.body=body,r);return r; }
const user=(id:string,status='pending')=>({userId:id,email:id+'@example.invalid',status,createdAt:'2026-10-21',approvedAt:null,approvedBy:null,pilotExpiresAt:null} as any);
function deps(): NonNullable<Parameters<typeof createCurrentUserHandler>[0]> { return {configured:()=>true,auth:async(req:any)=>req.verifiedActor,email:async(id:string)=>id+'@example.invalid',get:async(id:string)=>user(id),record:async()=>null,reconcile:async()=>0,studioProjects:async()=>[] as string[]}; }
test('existing invited artists receive independent studio scope without prototype promotion',async()=>{
 const d=deps();const reconciled:string[]=[];d.reconcile=async({userId})=>(reconciled.push(userId),1);
 d.studioProjects=async(id?:string)=>id==='artist-a'?['room-a']:['room-a','room-b'];
 const handler=createCurrentUserHandler(d);
 for(const id of ['artist-a','artist-b','artist-a']) {const r=response();await handler({method:'GET',verifiedActor:id,body:{userId:'forged'}} as any,r);assert.equal(r.code,200);assert.equal(r.body.status,'pending');assert.equal(r.body.userId,id);assert.deepEqual(r.body.studioAccess.projectIds,id==='artist-a'?['room-a']:['room-a','room-b']);}
 assert.deepEqual(reconciled,['artist-a','artist-b','artist-a']);
});
test('no eligible producer membership conveys no studio access',async()=>{const r=response();await createCurrentUserHandler(deps())({method:'GET',verifiedActor:'uninvited'} as any,r);assert.equal(r.body.status,'pending');assert.deepEqual(r.body.studioAccess.projectIds,[]);});
test('banned artists cannot reconcile an invitation or gain studio access',async()=>{const d=deps();d.get=async id=>user(id,'banned');d.reconcile=async()=>{throw new Error('must not reconcile');};d.studioProjects=async()=>{throw new Error('must not grant');};const r=response();await createCurrentUserHandler(d)({method:'GET',verifiedActor:'banned'} as any,r);assert.equal(r.code,200);assert.equal(r.body.status,'banned');assert.deepEqual(r.body.studioAccess.projectIds,[]);});
test('failed membership verification is a retryable failure, never an empty successful user',async()=>{const d=deps();d.studioProjects=async()=>{throw new Error('database unavailable');};const r=response();await createCurrentUserHandler(d)({method:'GET',verifiedActor:'artist'} as any,r);assert.equal(r.code,503);assert.equal(r.body.studioAccess,undefined);});
test('unauthenticated and non-GET requests cannot reconcile access',async()=>{const d=deps();d.auth=async(_q,r)=>{r.status(401).json({error:'no session'});return null;};d.get=async()=>{throw new Error('must not read');};let r=response();await createCurrentUserHandler(d)({method:'GET'} as any,r);assert.equal(r.code,401);r=response();await createCurrentUserHandler(d)({method:'POST'} as any,r);assert.equal(r.code,405);});
