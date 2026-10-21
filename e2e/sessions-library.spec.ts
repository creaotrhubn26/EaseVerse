import {test,expect} from '@playwright/test';
const makeTake=(id:string,title:string,date:number,score:number,lyrics='Hold the tone',favorite=false)=>({id,title,date,duration:8,lyrics,favorite,tags:['studio'],genre:'pop',recordingUri:'/qa-session.wav',insights:{textAccuracy:score,pronunciationClarity:80,timingConsistency:'medium',topToFix:[]}});
const fixture=[makeTake('chorus','QA chorus',1,80,'Hold the tone',true),makeTake('verse','QA verse',2,91),makeTake('memo','QA memo',3,100,'')];
// Isolated UI/storage checks with synthetic audio. No authenticated service or upload is exercised.
async function setup(page:any,takes:any[]=[]){
 await page.route('**/api/**',(route:any)=>route.fulfill({status:401,json:{error:'Missing CreatorHub session'}}));
 const wav=Buffer.alloc(44+48000*2*8);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 for(let n=0;n<48000*8;n++)wav.writeInt16LE(Math.round(Math.sin(n*2*Math.PI*220/48000)*1000),44+n*2);
 await page.route('**/qa-session.wav',(route:any)=>route.fulfill({contentType:'audio/wav',body:wav}));
 await page.addInitScript(({takes}:any)=>{if(!localStorage.getItem('qa-fixture-loaded')){localStorage.setItem('@lyricflow_sessions',JSON.stringify(takes));localStorage.setItem('qa-fixture-loaded','1');}},{takes});
 await page.goto('/sessions');
 const intro=page.getByRole('button',{name:'Skip intro',exact:true});await expect(intro).toBeVisible();await intro.click();await expect(intro).toHaveCount(0);
 await expect(page.getByTestId('sessions-local-count')).toBeVisible();
}
for(const width of [320,390,768,1440]){
 test(`Sessions empty and library actions fit ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await setup(page);
  const first=page.getByRole('button',{name:'Go to Sing to record your first take',exact:true});await first.scrollIntoViewIfNeeded();await expect(first).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:`outputs/warmup-fal-20261020/sessions-empty-${width}.png`,fullPage:true});
  await first.click();await expect(page.getByTestId('record-button')).toHaveCount(0);
  await page.evaluate(takes=>localStorage.setItem('@lyricflow_sessions',JSON.stringify(takes)),fixture);await page.goto('/sessions');await expect(page.getByRole('button',{name:'Skip intro',exact:true})).toBeVisible();await page.getByRole('button',{name:'Skip intro',exact:true}).click();await expect(page.getByRole('button',{name:'Skip intro',exact:true})).toHaveCount(0);
  await expect(page.getByTestId('sessions-local-count')).toHaveText('3 takes · on this device');
  await page.getByRole('button',{name:'Filter by Lyrics match',exact:true}).click();
  await expect(page.getByRole('button',{name:/^Open session/})).toHaveText([/QA verse/,/QA chorus/,/QA memo/]);
  const search=page.getByRole('textbox',{name:'Search your recordings',exact:true});await search.fill('VERSE');await expect(page.getByRole('button',{name:/^Open session/})).toHaveCount(1);await page.getByRole('button',{name:'Clear recording search',exact:true}).click();
  await page.getByRole('button',{name:'Filter by Favorites',exact:true}).click();await page.getByRole('button',{name:'Remove QA chorus from favorites',exact:true}).click();await expect(page.getByText('No favorites yet',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Show all recordings',exact:true}).click();
  await page.getByRole('button',{name:'Delete recording QA memo',exact:true}).click();await expect(page.getByText('Delete this recording?',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Keep recording',exact:true}).click();await expect(page.getByRole('button',{name:'Open session QA memo',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Delete recording QA memo',exact:true}).click();await page.getByRole('button',{name:'Confirm delete recording',exact:true}).click();await expect(page.getByRole('button',{name:'Open session QA memo',exact:true})).toHaveCount(0);
  await page.reload();await expect(page.getByRole('button',{name:'Skip intro',exact:true})).toBeVisible();await page.getByRole('button',{name:'Skip intro',exact:true}).click();await expect(page.getByRole('button',{name:'Skip intro',exact:true})).toHaveCount(0);await expect(page.getByTestId('sessions-local-count')).toHaveText('2 takes · on this device');await expect(page.getByRole('button',{name:'Add QA chorus to favorites',exact:true})).toBeVisible();
  await page.screenshot({path:`outputs/warmup-fal-20261020/sessions-library-${width}.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 });
}
test('recording playback, keyboard seek and pause when leaving review',async({page})=>{
 await setup(page,fixture);await page.getByRole('button',{name:'Open session QA verse',exact:true}).click();
 const play=page.getByRole('button',{name:'Play session audio',exact:true});await expect(play).toBeEnabled();await play.click();await expect(page.getByRole('button',{name:'Pause session audio',exact:true})).toBeVisible();
 const timeline=page.getByLabel('Playback position',{exact:true});await expect.poll(async()=>Number(await timeline.getAttribute('aria-valuenow'))).toBeGreaterThan(0.2);
 await page.getByRole('button',{name:'Pause session audio',exact:true}).click();await expect(play).toBeVisible();
 await timeline.focus();await page.keyboard.press('Home');await expect.poll(async()=>Number(await timeline.getAttribute('aria-valuenow'))).toBeLessThan(0.2);await page.keyboard.press('ArrowRight');await expect.poll(async()=>Number(await timeline.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(4.9);
 await play.click();await page.goBack();await expect(page.getByTestId('sessions-local-count')).toBeVisible();expect(await page.locator('audio').evaluateAll(els=>els.every(el=>(el as HTMLAudioElement).paused))).toBe(true);
});

test('studio recordings remain separate, keyboard disclosure and retry recover from server failure',async({page})=>{
 let attempts=0;
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/session')return route.fulfill({json:{user:{id:'qa-studio',email:'qa@example.invalid',name:'QA Studio'}}});
  if(path==='/api/users/me')return route.fulfill({json:{userId:'qa-studio',status:'approved'}});
  if(path==='/api/projects')return route.fulfill({json:{projects:[]}});
  if(path==='/api/takes'){attempts++;return route.fulfill(attempts===1?{status:503,json:{error:'Studio unavailable'}}:{json:{takes:[]}});}
  return route.fulfill({status:404,json:{error:'Not in this synthetic UI test'}});
 });
 await page.goto('/sessions');const intro=page.getByRole('button',{name:'Skip intro',exact:true});await expect(intro).toBeVisible();await intro.click();await expect(intro).toHaveCount(0);
 const studio=page.getByRole('button',{name:'Studio takes',exact:true});await expect(studio).toHaveAttribute('aria-expanded','false');await studio.focus();await page.keyboard.press('Enter');await expect(studio).toHaveAttribute('aria-expanded','true');
 await page.getByRole('button',{name:'Retry loading studio takes',exact:true}).click();await expect(page.getByRole('button',{name:'Retry loading studio takes',exact:true})).toHaveCount(0);await expect.poll(()=>attempts).toBe(2);
 await expect(page.getByTestId('sessions-local-count')).toHaveText('0 takes · on this device');
 await studio.focus();await page.keyboard.press('Space');await expect(studio).toHaveAttribute('aria-expanded','false');
});
test('missing audio remains disabled instead of suggesting playable media',async({page})=>{
 await setup(page,[{...fixture[0],recordingUri:undefined}]);await page.getByRole('button',{name:'Open session QA chorus',exact:true}).click();await expect(page.getByRole('button',{name:'Play session audio',exact:true})).toBeDisabled();await expect(page.getByText('Audio not saved for this session.',{exact:true})).toBeVisible();
});
