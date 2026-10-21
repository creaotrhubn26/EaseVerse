import {test,expect} from '@playwright/test';
async function openProfile(page:any){
 await page.goto('/profile');const skip=page.getByRole('button',{name:'Skip intro',exact:true});await expect(skip).toBeVisible();await skip.click();await expect(skip).toHaveCount(0);await expect(page.getByRole('heading',{name:'Profile',exact:true})).toBeVisible();
}
for(const width of [320,390,768,1440])test(`Profile settings persist and remain readable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.route('**/api/**',route=>route.fulfill({status:401,json:{error:'Missing CreatorHub session'}}));await openProfile(page);
 const voice=page.getByRole('button',{name:'Voice & language',exact:true});await expect(voice).toHaveAttribute('aria-expanded','false');await page.screenshot({path:`outputs/warmup-fal-20261020/profile-overview-${width}.png`,fullPage:true});
 await voice.focus();await page.keyboard.press('Enter');await expect(voice).toHaveAttribute('aria-expanded','true');
 const language=page.getByRole('button',{name:'Language: English',exact:true});await language.click();await expect(page.getByRole('radio',{name:'English',exact:true})).toHaveAttribute('aria-checked','true');await page.getByRole('radio',{name:'French',exact:true}).click();await expect(page.getByRole('button',{name:'Language: French',exact:true})).toBeVisible();
 await page.getByRole('button',{name:/^Accent Goal:/}).click();await page.getByRole('radio',{name:'UK',exact:true}).click();await page.getByRole('button',{name:'High option',exact:true}).click();await page.getByRole('button',{name:'Male option',exact:true}).click();
 await page.getByRole('button',{name:'Language: French',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('button',{name:'Language: French',exact:true})).toBeFocused();
 const recording=page.getByRole('button',{name:'Recording & timing',exact:true});await recording.scrollIntoViewIfNeeded();await recording.click();await page.getByRole('button',{name:'4 beats option',exact:true}).click();await page.getByRole('button',{name:'Fast option',exact:true}).click();await page.getByRole('button',{name:'Click + Vibrate option',exact:true}).click();await page.getByRole('button',{name:'Speed option',exact:true}).click();
 await page.getByRole('button',{name:'4 beats option',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`outputs/warmup-fal-20261020/profile-controls-${width}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 await page.reload();await page.getByRole('button',{name:'Skip intro',exact:true}).click();await voice.click();await expect(page.getByRole('button',{name:'Language: French',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Accent Goal: UK',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'High option',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('button',{name:'Male option',exact:true})).toHaveAttribute('aria-pressed','true');await recording.click();await expect(page.getByRole('button',{name:'4 beats option',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('button',{name:'Fast option',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('button',{name:'Speed option',exact:true})).toHaveAttribute('aria-pressed','true');
});
test('Profile uses explicit navigation and reports unavailable suggestions',async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({status:401,json:{error:'Missing CreatorHub session'}}));await openProfile(page);
 await page.getByRole('button',{name:'Practice suggestions',exact:true}).click();await page.getByRole('button',{name:/^Refresh Recommendations:/}).click();await expect(page.getByText('Practice suggestions are unavailable. Try again later.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Help & privacy',exact:true}).click();await page.getByRole('button',{name:'Privacy Policy: Read',exact:true}).click();await expect(page).toHaveURL(/\/privacy$/);await page.goBack();
 await page.getByRole('button',{name:'Sign in to CreatorHub',exact:true}).click();await expect(page.getByRole('button',{name:'Continue with CreatorHub',exact:true})).toBeVisible();
});
test('long signed-in account stays readable, usage retries and sign-out retains local data',async({page})=>{
 await page.setViewportSize({width:320,height:900});let signedIn=true,usageCalls=0,logoutCalls=0;
 const user={id:'qa-profile',name:'QA Music Producer With A Deliberately Long Display Name',email:'long-profile-address-for-layout@example.invalid'};
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/session')return signedIn?route.fulfill({json:{user}}):route.fulfill({status:401,json:{error:'Signed out'}});
  if(path==='/api/auth/logout'){logoutCalls++;if(logoutCalls===1)return route.fulfill({status:503,json:{error:'Temporary sign-out failure'}});signedIn=false;return route.fulfill({json:{ok:true}});}
  if(path==='/api/users/me')return route.fulfill({json:{userId:user.id,status:'approved'}});
  if(path==='/api/usage'){usageCalls++;return route.fulfill(usageCalls===1?{status:503,json:{error:'Not available'}}:{json:{day:null,week:null,month:null}});}
  return route.fulfill({status:404,json:{error:'Not part of this local fixture'}});
 });
 await page.addInitScript(()=>localStorage.setItem('@lyricflow_songs',JSON.stringify([{id:'qa-local',title:'Private local draft',lyrics:'Hold the tone',sections:[],genre:'pop',createdAt:1,updatedAt:1}])));
 await openProfile(page);await expect(page.getByText(user.name,{exact:true})).toBeVisible();await page.screenshot({path:'outputs/warmup-fal-20261020/profile-account-long-320.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
 await page.getByRole('button',{name:'Usage & administration',exact:true}).click();await page.getByRole('button',{name:'Retry loading usage',exact:true}).click();await expect(page.getByText('No usage recorded yet.',{exact:true})).toBeVisible();expect(usageCalls).toBe(2);await expect(page.getByRole('button',{name:'Open admin dashboard',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Sign out of CreatorHub',exact:true}).click();await expect(page.getByText('Could not confirm sign-out. Please try again.',{exact:true})).toBeVisible();await expect(page.getByText(user.name,{exact:true})).toBeVisible();await page.getByRole('button',{name:'Sign out of CreatorHub',exact:true}).click();await expect(page.getByText("You're signed out",{exact:true})).toBeVisible();expect(logoutCalls).toBe(2);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('@lyricflow_songs')||'[]')[0].title)).toBe('Private local draft');await expect(page.getByRole('button',{name:'Usage & administration',exact:true})).toHaveCount(0);
});
