import {test, expect} from '@playwright/test';

test('account deletion requires explicit confirmation, retains errors and confirms only the saved request',async({page})=>{
  let calls=0;
  await page.setViewportSize({width:320,height:900});
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/auth/session')return route.fulfill({json:{user:{id:'review-artist',email:'review@example.invalid',name:'Review Artist'}}});
    if(path==='/api/users/me')return route.fulfill({json:{userId:'review-artist',status:'approved'}});
    if(path==='/api/account/deletion-request'){
      calls++;expect(route.request().postDataJSON()).toEqual({confirmation:'DELETE MY ACCOUNT'});
      return route.fulfill(calls===1?{status:503,json:{error:'unavailable'}}:{status:202,json:{status:'requested',request:{id:'synthetic-review-receipt',requestedAt:'2026-10-22T12:00:00Z'}}});
    }
    return route.fulfill({status:404,json:{error:'Outside isolated fixture'}});
  });
  await page.goto('/account-deletion');await page.getByRole('button',{name:'Skip intro',exact:true}).click();
  const submit=page.getByRole('button',{name:'Request permanent account deletion',exact:true});
  await expect(submit).toBeDisabled();await expect(page.getByText(/shared CreatorHub account and the associated/)).toBeVisible();
  await page.getByRole('textbox',{name:'Deletion confirmation',exact:true}).fill('DELETE MY ACCOUNT');
  await submit.click();await expect(page.getByRole('alert')).toContainText('could not confirm');
  await expect(submit).toBeEnabled();await submit.click();
  await expect(page.getByText('Request reference: synthetic-review-receipt',{exact:true})).toBeVisible();
  await expect(page.getByText(/Your account has not been deleted yet/)).toBeVisible();expect(calls).toBe(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({path:'outputs/mobile-store-release-20261021/deletion-receipt-320.png',fullPage:true});
});

test('store build keeps stale cloud preferences from uploading new recordings',async({page})=>{
  test.skip(process.env.EXPO_PUBLIC_CLOUD_PRACTICE_ANALYSIS_ENABLED==='1','Run against the production cloud-disabled export.');
  let cloudCalls=0;
  await page.addInitScript(()=>{
    localStorage.setItem('@lyricflow_settings',JSON.stringify({cloudAnalysisEnabled:true,countIn:0}));
    localStorage.setItem('@lyricflow_songs',JSON.stringify([{id:'release-song',title:'Night lights',lyrics:'Hold the tone',sections:[],genre:'pop',createdAt:1,updatedAt:1}]));
  });
  await page.route('**/api/**',route=>{
    if(/session-score|learning\//.test(new URL(route.request().url()).pathname))cloudCalls++;
    return route.fulfill({status:401,json:{error:'No session in isolated fixture'}});
  });
  await page.goto('/profile');await page.getByRole('button',{name:'Skip intro',exact:true}).click();
  await page.getByRole('button',{name:'Recording & timing',exact:true}).click();
  await expect(page.getByRole('switch',{name:'Cloud practice analysis',exact:true})).toHaveCount(0);
  await page.getByRole('tab',{name:'Sing tab',exact:true}).click();await page.getByTestId('record-button').click();
  await expect(page.getByTestId('stop-button')).toBeVisible();await page.waitForTimeout(3500);await page.getByTestId('stop-button').click();
  await expect(page.getByRole('heading',{name:'Session Review',exact:true})).toBeVisible({timeout:20000});
  await expect(page.getByRole('button',{name:'Choose cloud lyric analysis',exact:true})).toHaveCount(0);
  expect(cloudCalls).toBe(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('@lyricflow_sessions')||'[]').length)).toBe(1);
});
