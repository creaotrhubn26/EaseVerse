import {test,expect} from '@playwright/test';
const actor={id:'qa-artist-a',name:'QA Artist A',email:'artist-a@example.invalid'};
for(const fixture of [
 {name:'invited artist',status:'pending',projects:['room-a'],allowed:true},
 {name:'second band member',status:'pending',projects:['room-a','room-b'],allowed:true},
 {name:'uninvited identity',status:'pending',projects:[],allowed:false},
 {name:'banned identity',status:'banned',projects:['room-a'],allowed:false},
])test(`release access: ${fixture.name}`,async({page})=>{
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/session')return route.fulfill({json:{user:actor}});
  if(path==='/api/users/me')return route.fulfill({json:{userId:actor.id,email:actor.email,status:fixture.status,studioAccess:{projectIds:fixture.projects}}});
  return route.fulfill({status:404,json:{error:'Outside isolated fixture'}});
 });
 await page.goto('/');const intro=page.getByRole('button',{name:'Skip intro',exact:true});await intro.click();await expect(intro).toHaveCount(0);
 if(fixture.allowed)await expect(page.getByRole('heading',{name:'Start with your voice.',exact:true})).toBeVisible();
 else {await expect(page.getByText(fixture.status==='banned'?'Access blocked':'Waiting for approval',{exact:true})).toBeVisible();await expect(page.getByTestId('record-button')).toHaveCount(0);}
});
test('release access fails closed on service errors and retries',async({page})=>{
 let fail=true;
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;
 if(path==='/api/auth/session')return route.fulfill({json:{user:actor}});
 if(path==='/api/users/me')return route.fulfill(fail?{status:503,json:{error:'Unavailable'}}:{json:{userId:actor.id,status:'pending',studioAccess:{projectIds:['room-a']}}});
 return route.fulfill({status:404,json:{error:'Outside isolated fixture'}});});
 await page.goto('/');await page.getByRole('button',{name:'Skip intro',exact:true}).click();
 await expect(page.getByRole('button',{name:'Retry account access',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Start with your voice.',exact:true})).toHaveCount(0);
 fail=false;await page.getByRole('button',{name:'Retry account access',exact:true}).click();await expect(page.getByRole('heading',{name:'Start with your voice.',exact:true})).toBeVisible();
});
for(const enabled of [false,true])test(`cloud analysis is ${enabled?'explicitly enabled':'off by default'} and local recording still works`,async({page})=>{
 let requests=0;
 await page.addInitScript(()=>localStorage.setItem('@lyricflow_songs',JSON.stringify([{id:'qa-consent',title:'QA local recording',lyrics:'Hold the tone',sections:[],genre:'pop',createdAt:1,updatedAt:1}])));
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;
 if(path==='/api/v1/session-score'){requests++;return route.fulfill({json:{transcript:'Hold the tone',provider:'openai',method:'transcription_text_match',insights:{textAccuracy:100,pronunciationClarity:0,timingConsistency:0,topToFix:[]}}});}
 return route.fulfill({status:401,json:{error:'No session in isolated fixture'}});});
 await page.goto('/profile');const intro=page.getByRole('button',{name:'Skip intro',exact:true});await intro.click();await expect(intro).toHaveCount(0);
 await page.getByRole('button',{name:'Recording & timing',exact:true}).click();const consent=page.getByRole('switch',{name:'Cloud practice analysis',exact:true});await expect(consent).toHaveAttribute('aria-checked','false');
 if(enabled){await consent.click();await expect(consent).toHaveAttribute('aria-checked','true');}
 await page.getByRole('tab',{name:'Sing tab',exact:true}).click();await page.getByTestId('record-button').click();await expect(page.getByTestId('stop-button')).toBeVisible();await page.waitForTimeout(3500);await page.getByTestId('stop-button').click();
 await expect(page.getByRole('heading',{name:'Session Review',exact:true})).toBeVisible({timeout:20000});expect(requests).toBe(enabled?1:0);
 if(!enabled)await expect(page.getByText('Not analysed',{exact:true})).toBeVisible();
 else await expect(page.getByTestId('session-insight-lyric-match')).toHaveAttribute('aria-label','Lyric match: 100%');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('@lyricflow_sessions')||'[]').length)).toBe(1);
});
