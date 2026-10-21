import {test,expect} from '@playwright/test';
for(const width of [320,390,768])test(`review labels keep complete words at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.route('**/api/**',route=>route.fulfill({status:401,json:{error:'Isolated local review fixture'}}));
 await page.addInitScript(()=>localStorage.setItem('@lyricflow_sessions',JSON.stringify([{id:'qa-wrap',title:'Evening light — a long rehearsal title',date:1,duration:12,lyrics:'Hold the tone',genre:'pop',tags:[],favorite:false,insights:{analysisAvailable:false,textAccuracy:0,pronunciationClarity:0,timingConsistency:'low',topToFix:[]}}])));
 await page.goto('/session/qa-wrap');await page.getByRole('button',{name:'Skip intro',exact:true}).click();
 for(const [key,label,value] of [['lyric-match','Lyric match','Not analysed'],['pronunciation','Pronunciation','Not measured'],['timing','Timing','Not measured']]){
  const row=page.getByTestId(`session-insight-${key}`);await row.scrollIntoViewIfNeeded();await expect(row).toHaveAttribute('aria-label',`${label}: ${value}`);
  const metrics=await row.evaluate(el=>{
   const box=el.getBoundingClientRect();const words=[];
   const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;
   while((n=walker.nextNode()))for(const match of n.textContent!.matchAll(/\S+/g)){
    const range=document.createRange();range.setStart(n,match.index!);range.setEnd(n,match.index!+match[0].length);
    const rects=[...range.getClientRects()];words.push({word:match[0],lines:rects.length,fits:rects.every(r=>r.left>=box.left&&r.right<=box.right)});
   }
   return words;
  });
  expect(metrics.every(w=>w.lines===1&&w.fits),JSON.stringify(metrics)).toBe(true);
 }
 const tips=page.getByRole('button',{name:'General Pop practice tips',exact:true});
 await tips.scrollIntoViewIfNeeded();await expect(tips).toHaveAttribute('aria-expanded','false');
 await expect(page.getByText('Vocal Style',{exact:true})).toHaveCount(0);
 await expect(page.getByText('General genre suggestions, not an assessment of this recording. No producer or AI has reviewed your voice for these tips.',{exact:true})).toBeVisible();
 await tips.focus();await page.keyboard.press('Enter');await expect(tips).toHaveAttribute('aria-expanded','true');
 await expect(page.getByText('Vocal Style',{exact:true})).toBeVisible();
 await tips.click();await expect(tips).toHaveAttribute('aria-expanded','false');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 await page.screenshot({path:`outputs/mobile-store-release-20261021/review-wrap-${width}.png`,fullPage:true});
});
