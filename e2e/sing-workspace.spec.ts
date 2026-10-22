import { test, expect } from '@playwright/test';

// Isolated UI fixtures; service-level producer invitations are tested separately.
const song = {
  id: 'qa-sing-layout', title: 'Evening light — a deliberately long song title for rehearsal',
  lyrics: '[Verse]\nHold the tone\nLeave a little space\n\n[Chorus]\nStay here with me\nUntil the morning comes',
  sections: [], genre: 'pop', createdAt: 1, updatedAt: 1,
};
for (const viewport of [{width:320,height:568},{width:390,height:844},{width:768,height:900},{width:1440,height:900}]) {
  test(`loaded Sing keeps lyrics and controls separate at ${viewport.width}px`, async ({page}) => {
    await page.setViewportSize(viewport);
    await page.route('**/api/**', route => route.fulfill({status:401,json:{error:'No session in local UI fixture'}}));
    await page.addInitScript(song => localStorage.setItem('@lyricflow_songs',JSON.stringify([song])), song);
    await page.goto('/');
    const intro=page.getByRole('button',{name:'Skip intro',exact:true});
    await intro.click();await expect(intro).toHaveCount(0);
    await expect(page.getByRole('heading',{name:song.title,exact:true})).toBeVisible();
    const preparation=page.getByRole('button',{name:'Before you sing',exact:true});
    await expect(preparation).toHaveAttribute('aria-expanded','false');
    await expect(page.getByTestId('sing-recording-status')).toContainText('Mic off');
    await expect(page.getByText('Good',{exact:true})).toHaveCount(0);
    await page.screenshot({path:`outputs/sing-ux-20261021/sing-overview-${viewport.width}.png`});
    const record=page.getByTestId('record-button'), content=page.getByTestId('sing-content');
    const recordBox=await record.boundingBox(), contentBox=await content.boundingBox();
    expect(recordBox).not.toBeNull(); expect(contentBox).not.toBeNull();
    expect(recordBox!.y).toBeGreaterThanOrEqual(contentBox!.y+contentBox!.height);
    expect(recordBox!.y+recordBox!.height).toBeLessThan(viewport.height);
    expect(recordBox!.x).toBeGreaterThanOrEqual(0);
    expect(recordBox!.x+recordBox!.width).toBeLessThanOrEqual(viewport.width);
    await preparation.focus(); await page.keyboard.press('Enter');
    await expect(preparation).toHaveAttribute('aria-expanded','true');
    for (const label of ['Open warm up','Open mindfulness','Open EasePocket timing trainer']) {
      const button=page.getByRole('button',{name:label,exact:true});
      await button.scrollIntoViewIfNeeded(); await expect(button).toBeVisible();
      const bounds=await button.boundingBox();expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(viewport.width);
    }
    await preparation.scrollIntoViewIfNeeded();await preparation.click();
    const canvas=page.getByTestId('sing-lyrics-canvas');await canvas.scrollIntoViewIfNeeded();
    await expect(canvas.getByLabel('Until the morning comes',{exact:true})).toHaveCount(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({path:`outputs/sing-ux-20261021/sing-${viewport.width}.png`});
    const edit=page.getByTestId('inline-edit-button');await edit.scrollIntoViewIfNeeded();await edit.click();
    await expect(page.getByRole('button',{name:'Save lyrics',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.getByRole('button',{name:'Choose song',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Select Song',exact:true})).toBeVisible();
  });
}
