import {test,expect,type Page} from '@playwright/test';
test.use({hasTouch:true});
// UI speech fixtures cover controls/errors/cancellation, not actual audible output.
async function setup(page:Page,mode:'voice'|'missing'|'error'='voice'){
 await page.addInitScript(({mode})=>{
  const state={spoken:[] as string[],stops:0,current:null as any};(window as any).__wordSpeech=state;
  (window as any).SpeechSynthesisUtterance=class{onstart:any;onend:any;onpause:any;onerror:any;voice:any;text='';};
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
   getVoices:()=>mode==='missing'?[]:[{voiceURI:'qa-installed-en',name:'QA English',lang:'en-US',localService:true,default:true}],
   cancel:()=>{state.stops++;const current=state.current;state.current=null;current?.onpause?.({});},
   speak:(utterance:any)=>{state.spoken.push(utterance.text);state.current=utterance;setTimeout(()=>{if(state.current!==utterance)return;if(mode==='error')utterance.onerror?.({error:'audio-busy'});else utterance.onstart?.({});},10);},
  }});
  const bytes=new Uint8Array(16044),view=new DataView(bytes.buffer);for(const [offset,text] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']] as const)for(let i=0;i<text.length;i++)bytes[offset+i]=text.charCodeAt(i);
  view.setUint32(4,16036,true);view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);view.setUint32(40,16000,true);
  localStorage.setItem('@lyricflow_sessions',JSON.stringify([{id:'qa-word',title:'Word playback',date:1,duration:1,lyrics:'To the stars and way beyond',recordingUri:`data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`,genre:'pop',tags:[],favorite:false,transcript:'To the start and way beyond',analysis:{provider:'apple-speech',language:'English',analysedAt:1,comparison:{score:83,expectedWords:6,recognizedWords:6,matchedWords:5,substitutions:1,missingWords:0,extraWords:0,wordsToCheck:['stars']}},insights:{analysisAvailable:true,textAccuracy:83,pronunciationClarity:0,timingConsistency:'low',topToFix:[{word:'stars',reason:'Not matched in the transcript. Listen back and check this word.'}]}}]));
 },{mode});
 await page.route('**/api/**',route=>route.fulfill({status:401,json:{error:'Isolated speech UI fixture'}}));
 await page.goto('/session/qa-word');await page.getByRole('button',{name:'Skip intro',exact:true}).click();
}
for(const width of [320,390,768])test(`review playback and practice actions are centred and touch-friendly at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page);
 const play=page.getByRole('button',{name:'Play session audio',exact:true});await play.scrollIntoViewIfNeeded();await expect(play).toBeEnabled();
 const playBox=(await play.boundingBox())!;expect(playBox.height).toBeGreaterThanOrEqual(52);expect(playBox.width).toBeGreaterThanOrEqual(148);expect(Math.abs(playBox.x+playBox.width/2-width/2)).toBeLessThanOrEqual(1);
 const practice=page.getByRole('button',{name:'Open practice loop',exact:true}),practiceBox=(await practice.boundingBox())!;
 expect(practiceBox.height).toBeGreaterThanOrEqual(56);expect(Math.abs(practiceBox.x+practiceBox.width/2-width/2)).toBeLessThanOrEqual(1);
 await page.screenshot({path:`outputs/mobile-store-release-20261021/session-actions-centered-${width}.png`,fullPage:true});
 const word=page.getByRole('button',{name:'Hear pronunciation example for stars',exact:true});await word.scrollIntoViewIfNeeded();expect((await word.boundingBox())!.height).toBeGreaterThanOrEqual(76);
 // Touch the row away from its icon: the whole row is the action.
 await word.tap({position:{x:45,y:25}});
 await expect(page.getByRole('button',{name:'Stop pronunciation example for stars',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__wordSpeech.spoken)).toEqual(['stars']);
 await page.getByRole('button',{name:'Stop pronunciation example for stars',exact:true}).tap();
 await expect(word).toBeVisible();await expect(page.getByText(/Playing example pronunciation/)).toHaveCount(0);
 await word.focus();await page.keyboard.press('Enter');await expect(page.getByRole('button',{name:'Stop pronunciation example for stars',exact:true})).toBeVisible();
 await page.screenshot({path:`outputs/mobile-store-release-20261021/word-audio-touch-${width}.png`,fullPage:true});
 await practice.tap();await expect(page.getByRole('button',{name:'Hear pronunciation example',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__wordSpeech.current)).toBeNull();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});
test('missing system speech voice produces an actionable error',async({page})=>{
 // Return an unrelated installed voice so the browser voice-list promise resolves.
 await setup(page);await page.evaluate(()=>{window.speechSynthesis.getVoices=()=>[{voiceURI:'qa-french',name:'QA French',lang:'fr-FR',localService:true}] as any;});
 await page.getByRole('button',{name:'Hear pronunciation example for stars',exact:true}).click();await expect(page.getByRole('alert')).toContainText('No speech voice');
 await expect(page.getByRole('button',{name:'Retry pronunciation for stars',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__wordSpeech.spoken)).toHaveLength(0);
});
test('speech engine failure stays visible and can be retried',async({page})=>{
 await setup(page,'error');await page.getByRole('button',{name:'Hear pronunciation example for stars',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Could not play the example');
 await page.getByRole('button',{name:'Retry pronunciation for stars',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__wordSpeech.spoken.length)).toBe(2);
});
test('200% action text wraps without horizontal overflow or hiding the final lyrics behind the footer',async({page})=>{
 await page.setViewportSize({width:320,height:900});await setup(page);
 for(const label of ['Play','Practice Loop','stars'])await page.getByText(label,{exact:true}).evaluate(el=>{(el as HTMLElement).style.fontSize='32px';(el as HTMLElement).style.lineHeight='40px';});
 const play=page.getByRole('button',{name:'Play session audio',exact:true});await play.scrollIntoViewIfNeeded();const playBox=(await play.boundingBox())!;expect(playBox.height).toBeGreaterThanOrEqual(52);expect(Math.abs(playBox.x+playBox.width/2-160)).toBeLessThanOrEqual(1);
 const lyrics=page.getByText('To the stars and way beyond',{exact:true});await lyrics.scrollIntoViewIfNeeded();const lyricBox=(await lyrics.boundingBox())!,footer=(await page.getByRole('button',{name:'Open practice loop',exact:true}).boundingBox())!;
 expect(lyricBox.y+lyricBox.height).toBeLessThanOrEqual(footer.y);
 expect(Math.abs(footer.x+footer.width/2-160)).toBeLessThanOrEqual(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
 await page.screenshot({path:'outputs/mobile-store-release-20261021/session-actions-large-text-320.png',fullPage:true});
});
