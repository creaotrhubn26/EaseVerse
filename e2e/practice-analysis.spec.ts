import {test,expect,type Page} from '@playwright/test';
// UI-only fixtures exercise consent, retry and persistence. They do not certify a speech engine.
const actor={id:'qa-practice',email:'practice@example.invalid',name:'QA Artist'};
const result={transcript:'Hold the tone',provider:'openai',method:'transcription_text_match'};
async function openTake(page:Page,score:(route:any)=>Promise<void>){
 await page.addInitScript(()=>{
  const wav=new Uint8Array(100);wav.set([82,73,70,70]);wav.set([87,65,86,69],8);
  const base64=btoa(String.fromCharCode(...wav));
  localStorage.setItem('@lyricflow_sessions',JSON.stringify([{id:'qa-analysis',title:'Evening light',date:1,duration:8,lyrics:'Hold the tone',recordingUri:`data:audio/wav;base64,${base64}`,genre:'pop',tags:[],favorite:false,insights:{analysisAvailable:false,textAccuracy:0,pronunciationClarity:0,timingConsistency:'low',topToFix:[]}}]));
 });
 await page.context().route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/session')return route.fulfill({json:{user:actor}});
  if(path==='/api/users/me')return route.fulfill({json:{userId:actor.id,status:'pending',studioAccess:{projectIds:['qa-room']}}});
  if(path==='/api/v1/session-score')return score(route);
  return route.fulfill({status:404,json:{error:'Outside isolated UI fixture'}});
 });
 await page.goto('/session/qa-analysis');await page.getByRole('button',{name:'Skip intro',exact:true}).click();
 await expect(page.getByTestId('practice-analysis-panel')).toBeVisible();
}
test('manual cloud analysis requires a separate confirmation and saves a genuine text comparison across reload',async({page})=>{
 let calls=0;
 await page.setViewportSize({width:320,height:900});
 await openTake(page,async route=>{calls++;const body=route.request().postDataJSON();expect(body.consent).toBe(true);expect(body.lyrics).toBe('Hold the tone');expect(body.audioBase64).toBeTruthy();expect(body.userId).toBeUndefined();await route.fulfill({json:result});});
 expect(calls).toBe(0);
 const choose=page.getByRole('button',{name:'Choose cloud lyric analysis',exact:true});await choose.click();
 await expect(page.getByText(/Send this recording to OpenAI/)).toBeVisible();expect(calls).toBe(0);
 await page.getByRole('button',{name:'Keep it on this device',exact:true}).click();expect(calls).toBe(0);
 await choose.click();await page.getByRole('button',{name:'Send recording for cloud lyric analysis',exact:true}).click();
 await expect(page.getByTestId('session-insight-lyric-match')).toHaveAttribute('aria-label','Lyric match: 100%');
 await expect(page.getByText('Source: OpenAI transcription · English',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Show recognised words',exact:true}).click();await expect(page.getByTestId('practice-analysis-panel').getByText('Hold the tone',{exact:true})).toBeVisible();
 await expect(page.getByTestId('session-insight-pronunciation')).toHaveAttribute('aria-label','Pronunciation: Not measured');
 expect(calls).toBe(1);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('@lyricflow_settings')||'{}').cloudAnalysisEnabled??false)).toBe(false);
 // Verify persisted data independently of React state.
 await page.screenshot({path:'outputs/mobile-store-release-20261021/practice-analysis-320.png',fullPage:true});
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('@lyricflow_sessions')||'[]'));
 expect(stored[0].analysis.comparison.matchedWords).toBe(3);
 // A second page has no init script and reads the first page's actual persisted result.
 const second=await page.context().newPage();await second.goto('/session/qa-analysis');
 await expect(second.getByTestId('session-insight-lyric-match')).toHaveAttribute('aria-label','Lyric match: 100%');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
for(const status of [422,429,503])test(`analysis ${status} keeps the take and permits an explicit retry`,async({page})=>{
 let calls=0;await openTake(page,async route=>{calls++;await route.fulfill(calls===1?{status,json:{error:'temporary'}}:{json:result});});
 const send=async()=>{await page.getByRole('button',{name:'Choose cloud lyric analysis',exact:true}).click();await page.getByRole('button',{name:'Send recording for cloud lyric analysis',exact:true}).click();};
 await send();await expect(page.getByRole('alert')).toBeVisible();
 await expect(page.getByTestId('session-insight-lyric-match')).toHaveAttribute('aria-label','Lyric match: Not analysed');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('@lyricflow_sessions')||'[]')[0].recordingUri)).toContain('data:audio/wav');
 await send();await expect(page.getByTestId('session-insight-lyric-match')).toHaveAttribute('aria-label','Lyric match: 100%');expect(calls).toBe(2);
});
test('cancellation ignores a late provider result and a retry does not duplicate requests',async({page})=>{
 let calls=0,release:()=>void=()=>{};
 await openTake(page,async route=>{calls++;if(calls===1)await new Promise<void>(resolve=>release=resolve);await route.fulfill({json:result}).catch(()=>{});});
 const choose=page.getByRole('button',{name:'Choose cloud lyric analysis',exact:true});await choose.click();await page.getByRole('button',{name:'Send recording for cloud lyric analysis',exact:true}).click();
 await expect(page.getByRole('button',{name:'Cancel analysis',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Cancel analysis',exact:true}).click();release();
 await expect(choose).toBeVisible();await expect(page.getByTestId('session-insight-lyric-match')).toHaveAttribute('aria-label','Lyric match: Not analysed');
 await choose.click();await page.getByRole('button',{name:'Send recording for cloud lyric analysis',exact:true}).dblclick();
 await expect(page.getByTestId('session-insight-lyric-match')).toHaveAttribute('aria-label','Lyric match: 100%');expect(calls).toBe(2);
});
test('unrelated recognised words are visible without a red singing score or targeted word advice',async({page})=>{
 await page.setViewportSize({width:320,height:900});
 await openTake(page,async route=>route.fulfill({json:{...result,transcript:'Yeah I hate London'}}));
 await page.getByRole('button',{name:'Choose cloud lyric analysis',exact:true}).click();
 await page.getByRole('button',{name:'Send recording for cloud lyric analysis',exact:true}).click();
 await expect(page.getByTestId('session-insight-lyric-match')).toHaveAttribute('aria-label','Lyric match: No word matches');
 await expect(page.getByTestId('unmatched-transcript')).toHaveText('Yeah I hate London');
 await expect(page.getByText('Words to check',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Show recognised words',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
 // Old stored results can still contain suggestions: do not surface them on reload.
 await page.evaluate(()=>{const items=JSON.parse(localStorage.getItem('@lyricflow_sessions')!);items[0].insights.topToFix=[{word:'hold',reason:'Old suggestion'}];localStorage.setItem('@lyricflow_sessions',JSON.stringify(items));});
 const second=await page.context().newPage();await second.goto('/session/qa-analysis');
 await expect(second.getByTestId('unmatched-transcript')).toHaveText('Yeah I hate London');
 await expect(second.getByText('Words to check',{exact:true})).toHaveCount(0);
 await page.getByTestId('unmatched-transcript').scrollIntoViewIfNeeded();
 await page.screenshot({path:'outputs/mobile-store-release-20261021/practice-no-word-matches-320.png',fullPage:true});
});
