import {test,expect} from '@playwright/test';
const makeTake=(id:string,title:string,date:number,score:number,lyrics='Hold the tone',favorite=false)=>({id,title,date,duration:8,lyrics,favorite,tags:['studio'],genre:'pop',recordingUri:'/qa-session.wav',insights:{textAccuracy:score,pronunciationClarity:80,timingConsistency:'medium',topToFix:[]}});
const fixture=[makeTake('chorus','QA chorus',1,80,'Hold the tone',true),makeTake('verse','QA verse',2,91),makeTake('memo','QA memo',3,100,'')];
// Isolated UI/storage checks with synthetic audio. No authenticated service or upload is exercised.
async function setup(page:any,takes:any[]=[]){
 await page.route('**/api/**',(route:any)=>route.fulfill({status:401,json:{error:'Missing CreatorHub session'}}));
 const wav=Buffer.alloc(44+48000*2*8);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 for(let n=0;n<48000*8;n++)wav.writeInt16LE(Math.round(Math.sin(n*2*Math.PI*220/48000)*1000),44+n*2);
 await page.route('**/qa-session.wav',(route:any)=>{
  // Chromium requests byte ranges for seekable audio, just like private S3 playback.
  const range=/bytes=(\d+)-(\d*)/.exec(route.request().headers().range||'');
  if(!range)return route.fulfill({contentType:'audio/wav',headers:{'Accept-Ranges':'bytes'},body:wav});
  const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),wav.length-1):wav.length-1;
  return route.fulfill({status:206,contentType:'audio/wav',headers:{'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${wav.length}`},body:wav.subarray(start,end+1)});
 });
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


for (const width of [320, 390]) {
 test(`studio recording opens the selected take at ${width}px despite a detail failure`, async ({page}) => {
  await page.setViewportSize({width,height:844});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const selectedId='22222222-2222-4222-8222-222222222222';
  let detailFails=true;
  const take={id:selectedId,projectId:'qa-project',externalTrackId:'qa-song',filename:'Selected vocal.wav',status:'done',uploadedAt:'2026-10-22T09:40:00Z',durationSec:12,storageUrl:`/api/takes/${selectedId}/audio`};
  const boothTake=(id:string,filename:string,note:string)=>({id,filename,producerNote:note,audioUrl:'/qa-session.wav',regions:[],consensus:{agree:0,disagree:0},status:'done',uploadedAt:'2026-10-22T09:40:00Z'});
  await page.route('**/api/**',route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/api/auth/session')return route.fulfill({json:{user:{id:'studio-artist',email:'qa@example.invalid',name:'QA Artist'}}});
   if(url.pathname==='/api/users/me')return route.fulfill({json:{userId:'studio-artist',status:'approved'}});
   if(url.pathname==='/api/projects')return route.fulfill({json:{projects:[{id:'qa-project',name:'QA Studio',role:'vocalist'}]}});
   if(url.pathname==='/api/takes')return route.fulfill(url.searchParams.has('id') ? detailFails ? {status:503,json:{error:'Detail service unavailable'}} : {json:{...take,analysis:null}} : {json:{takes:[take]}});
   if(url.pathname==='/api/booth'){
    expect(url.searchParams.get('trackId')).toBe('qa-song');expect(url.searchParams.get('projectId')).toBe('qa-project');
    return route.fulfill({json:{trackId:'qa-song',projectId:'qa-project',lyrics:{title:'QA Song',lyrics:'Hold the tone',bpm:92.5},takes:[boothTake('newest','Newest vocal.wav','Newest note'),boothTake(selectedId,take.filename,'Hold the pause before the next line.')],referenceTrack:null}});
   }
   if(url.pathname==='/api/takes/vote')return route.fulfill({json:{agree:0,disagree:0,votes:[],myVote:null}});
   return route.fulfill({status:404,json:{error:'Not part of this isolated fixture'}});
  });
  await page.goto('/sessions');await page.getByRole('button',{name:'Skip intro',exact:true}).click();
  await page.getByRole('button',{name:'Studio takes',exact:true}).click();
  const failure=page.getByRole('alert').filter({hasText:'Could not load recording details'});
  await expect(failure).toContainText('503');
  const open=page.getByRole('button',{name:'Open studio recording Selected vocal.wav',exact:true});
  const box=await open.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(48);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:`outputs/mobile-store-release-20261021/studio-detail-error-${width}.png`,fullPage:true});
  detailFails=false;await page.getByRole('button',{name:'Retry details for Selected vocal.wav',exact:true}).click();await expect(failure).toHaveCount(0);
  await open.click();await expect(page).toHaveURL(new RegExp(`booth/qa-song.*takeId=${selectedId}`));
  await expect(page.getByText('Hold the pause before the next line.',{exact:true})).toBeVisible();
  await expect(page.getByText('Newest note',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Start metronome, producer tempo 92.5 BPM',exact:true})).toBeVisible();
  await page.screenshot({path:`outputs/mobile-store-release-20261021/studio-selected-take-${width}.png`,fullPage:true});
  expect(errors).toEqual([]);
 });
}

test('expired studio access leaves a persistent sign-in explanation',async({page})=>{
 let expire=false;
 await page.route('**/api/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/auth/start')return route.fulfill({status:503,json:{error:'CreatorHub login is temporarily unavailable'}});
  if(url.pathname==='/api/auth/session')return route.fulfill({json:{user:{id:'qa-expiring',email:'qa@example.invalid'}}});
  if(url.pathname==='/api/users/me')return route.fulfill({json:{userId:'qa-expiring',status:'approved'}});
  if(url.pathname==='/api/projects')return route.fulfill({json:{projects:[]}});
  if(url.pathname==='/api/takes')return route.fulfill(expire?{status:401,json:{error:'Session expired'}}:{status:503,json:{error:'Temporary studio failure'}});
  return route.fulfill({status:404,json:{error:'Not part of this isolated fixture'}});
 });
 await page.goto('/sessions');await page.getByRole('button',{name:'Skip intro',exact:true}).click();await page.getByRole('button',{name:'Studio takes',exact:true}).click();
 expire=true;await page.getByRole('button',{name:'Retry loading studio takes',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Sign in to open your private studio recordings.');
 await expect(page.getByRole('button',{name:'Sign in to open studio recordings',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Your recordings',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Sign in to open studio recordings',exact:true}).click();
 await expect(page.getByText('CreatorHub login is temporarily unavailable',{exact:true})).toBeVisible();
});

for (const language of ['English', 'Norwegian']) {
 for (const width of [320, 390, 768]) {
  test(`current studio session stays identifiable in ${language} at ${width}px`, async ({page}) => {
   const en=language==='English';
   const projectName='Northern Lights – Artist and producer collaboration – Album sessions in Oslo';
   const songTitle='Evening light – Acoustic version';
   const makeStudioTake=(id:string,name:string)=>({id,filename:name,producerNote:'Hold the tone. Hold the pause before the next line.',audioUrl:'https://audio.example.invalid/vocal.wav',regions:[],consensus:{agree:0,disagree:0},status:'done',uploadedAt:'2026-10-22T09:40:00Z',durationSec:2,energyAvgDb:null,lyricsSnapshot:null});
   const takeA=makeStudioTake('take-1','Chorus – Take 05.wav'),takeB=makeStudioTake('take-2','Verse 2 – Piano and vocal – Take 04.wav');
   await page.setViewportSize({width,height:640});
   await page.addInitScript(language=>localStorage.setItem('@lyricflow_settings',JSON.stringify({language})),language);
   await page.route('**/api/**',route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/auth/session')return route.fulfill({json:{user:{id:'session-artist',email:'qa@example.invalid',name:'QA Artist'}}});
    if(url.pathname==='/api/users/me')return route.fulfill({json:{userId:'session-artist',status:'approved'}});
    if(url.pathname==='/api/booth')return route.fulfill({json:{trackId:'private-track-identifier',projectId:'qa-project',project:{id:'qa-project',name:projectName},lyrics:{title:songTitle,lyrics:'Hold the tone',bpm:92.5},takes:[takeA,takeB],referenceTrack:{url:'https://audio.example.invalid/reference.wav',name:'Evening light – Approved mix V3.wav'},recordingRequests:[]}});
    if(url.pathname==='/api/studio-bookings')return route.fulfill({json:{packages:[],sessions:[]}});
    if(url.pathname==='/api/takes/vote')return route.fulfill({json:{agree:0,disagree:0,votes:[],myVote:null}});
    return route.fulfill({status:404,json:{error:'Isolated UI fixture'}});
   });
   const wav=Buffer.alloc(44+48000*2*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
   await page.route('https://audio.example.invalid/**',route=>route.fulfill({contentType:'audio/wav',body:wav}));
   await page.goto('/booth/private-track-identifier?projectId=qa-project&takeId=take-2');
   const intro=page.getByRole('button',{name:'Skip intro',exact:true});await expect(intro).toBeVisible();await intro.click();await expect(intro).toHaveCount(0);
   const title=page.getByTestId('booth-session-title');
   await expect(title).toHaveText(projectName);
   await expect(page.getByTestId('booth-session-song')).toHaveText(`${en?'Song':'Sang'}: ${songTitle}`);
   await expect(page.getByTestId('booth-session-recording')).toHaveText(takeB.filename);
   await expect(page.getByTestId('booth-session-selection')).toContainText(en?'Selected take 2 of 2':'Valgt opptak 2 av 2');
   await expect(page.getByTestId('booth-session-selection')).toContainText('2026');
   expect(await title.evaluate(el=>({height:el.clientHeight,scrollHeight:el.scrollHeight,overflow:getComputedStyle(el).overflow}))).toMatchObject({overflow:'visible'});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
   await page.getByRole('tab',{name:'Lyrics',exact:true}).click();await expect(title).toBeVisible();
   await page.getByRole('tab',{name:'Takes',exact:true}).click();await page.getByRole('button',{name:`Open ${takeA.filename}`,exact:true}).click();
   await expect(page.getByTestId('booth-session-recording')).toHaveText(takeA.filename);
   await expect(title).toHaveText(projectName);
   await page.getByRole('button',{name:'Reference mix',exact:true}).click();
   await expect(page.getByTestId('booth-session-recording')).toHaveText('Evening light – Approved mix V3.wav');
   await expect(title).toHaveText(projectName);
   await expect(page.getByRole('button',{name:'Play',exact:true})).toBeEnabled();
   const play=await page.getByRole('button',{name:'Play',exact:true}).boundingBox();expect(play!.height).toBeGreaterThanOrEqual(48);expect(play!.width).toBeGreaterThanOrEqual(48);
   await page.screenshot({path:`outputs/mobile-store-release-20261021/session-context-${language}-${width}.png`,fullPage:true});
  });
 }
}
