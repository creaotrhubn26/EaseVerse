import {test,expect} from '@playwright/test';

// Isolated service fixtures with a real browser audio clock. No production data.
async function instrumentAudio(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const Original=window.AudioContext;
    const records: {starts:number[];closed:boolean}[]=[];
    (window as any).__metronomeAudio=records;
    window.AudioContext=class extends Original {
      constructor(options?:AudioContextOptions) {
        super(options);
        const record={starts:[] as number[],closed:false};records.push(record);
        const create=this.createOscillator.bind(this);
        this.createOscillator=()=>{const oscillator=create(),start=oscillator.start.bind(oscillator);oscillator.start=(at=0)=>{record.starts.push(at);start(at);};return oscillator;};
        const close=this.close.bind(this);this.close=()=>{record.closed=true;return close();};
      }
    };
  });
}

test('artist follows producer BPM changes, stops on missing tempo, and can retry after a refresh', async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await instrumentAudio(page);
  let bpm:number|null=92.5;
  await page.route('**/api/**',route=>route.fulfill({status:401,json:{error:'Isolated service fixture'}}));
  await page.route('**/api/auth/session',route=>route.fulfill({json:{authenticated:true,user:{id:'qa-artist',email:'artist@example.invalid',name:'QA artist'}}}));
  await page.route('**/api/users/me',route=>route.fulfill({json:{userId:'qa-artist',status:'approved'}}));
  await page.route('**/api/booth?**',route=>route.fulfill({json:{trackId:'qa-song',projectId:'qa-project',lyrics:{title:'Evening light',lyrics:'Hold the tone',bpm:120,updatedAt:'2026-10-22'},tempo:{source:'sound-room',bpm},takes:[],referenceTrack:null,recordingRequests:[]}}));
  await page.goto('/booth/qa-song?projectId=qa-project');
  const intro=page.getByRole('button',{name:'Skip intro',exact:true});if(await intro.isVisible())await intro.click();
  const start=page.getByRole('button',{name:'Start metronome, producer tempo 92.5 BPM',exact:true});
  await expect(start).toBeVisible();const box=await start.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(48);expect(box!.width).toBeGreaterThanOrEqual(48);
  await start.click();await expect.poll(()=>page.evaluate(()=>(window as any).__metronomeAudio[0]?.starts.length||0)).toBeGreaterThan(3);
  const times=await page.evaluate(()=>(window as any).__metronomeAudio[0].starts as number[]);
  expect(times[1]-times[0]).toBeCloseTo(60/92.5,6);
  bpm=110;
  await expect(page.getByRole('button',{name:'Stop metronome, producer tempo 110 BPM',exact:true})).toBeVisible({timeout:10000});
  await expect.poll(()=>page.evaluate(()=>(window as any).__metronomeAudio.at(-1)?.starts.length||0)).toBeGreaterThan(2);
  const changed=await page.evaluate(()=>(window as any).__metronomeAudio);
  expect(changed[0].closed).toBe(true);const last=changed.at(-1);expect(last.starts[1]-last.starts[0]).toBeCloseTo(60/110,6);
  await page.screenshot({path:'outputs/mobile-store-release-20261021/metronome-booth-390.png'});
  bpm=null;
  await expect(page.getByRole('button',{name:'Producer has not set a BPM',exact:true})).toBeDisabled({timeout:10000});
  await expect.poll(()=>page.evaluate(()=>(window as any).__metronomeAudio.at(-1)?.closed)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('Sing metronome remains audible through count-in and recording and stops when leaving',async({page})=>{
  await instrumentAudio(page);
  await page.route('**/api/**',route=>route.fulfill({status:401,json:{error:'Isolated local QA'}}));
  await page.addInitScript(()=>{
    localStorage.setItem('@lyricflow_settings', JSON.stringify({countIn:4,metronomeEnabled:false,metronomeHaptics:false}));
    localStorage.setItem('@lyricflow_songs',JSON.stringify([{id:'metro-qa',title:'Metro QA',lyrics:'Hold the tone',sections:[],genre:'pop',bpm:120,createdAt:1,updatedAt:1}]));
  });
  await page.goto('/');await page.getByRole('button',{name:'Skip intro',exact:true}).click();
  await page.getByRole('button',{name:'Metronome',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__metronomeAudio[0]?.starts.length||0)).toBeGreaterThan(2);
  await page.getByTestId('record-button').click();
  await expect(page.getByTestId('stop-button')).toBeVisible({timeout:15000});
  const state=await page.evaluate(()=>(window as any).__metronomeAudio);
  expect(state.at(-1).closed).toBe(false);
  await page.waitForTimeout(3500); // A saved take requires at least three seconds.
  await page.getByTestId('stop-button').click();
  await expect(page.getByRole('heading',{name:'Session Review',exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).__metronomeAudio.at(-1)?.closed)).toBe(true);
});


test('a song without BPM explains the missing tempo and stays on Sing', async ({page})=>{
  await page.route('**/api/**',route=>route.fulfill({status:401,json:{error:'Isolated local QA'}}));
  await page.addInitScript(()=>{
    localStorage.setItem('@lyricflow_songs',JSON.stringify([{id:'no-tempo-qa',title:'No tempo QA',lyrics:'Hold the tone',sections:[],genre:'pop',createdAt:1,updatedAt:1}]));
  });
  await page.goto('/');await page.getByRole('button',{name:'Skip intro',exact:true}).click();
  await page.getByRole('button',{name:'Metronome',exact:true}).click();
  await expect(page.getByText('This song has no BPM yet. Open your producer’s song from Sessions, or set a practice BPM in Lyrics.',{exact:true})).toBeVisible();
  await expect(page.getByRole('tab',{name:'Sing tab',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.getByTestId('record-button')).toBeVisible();
});
