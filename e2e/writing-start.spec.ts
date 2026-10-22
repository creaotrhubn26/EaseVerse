import { test, expect } from '@playwright/test';

for (const width of [320, 390, 768, 1440]) {
  test(`writing workspace preserves drafts and fits ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    // These are isolated local UI/storage checks, not authenticated service E2E.
    await page.route('**/api/**', route => route.fulfill({status:401,json:{error:'Missing CreatorHub session'}}));
    await page.goto('/');
    const intro = page.getByRole('button', {name:'Skip intro',exact:true});
    await expect(intro).toBeVisible();await intro.click();await expect(intro).toHaveCount(0);
    await expect(page.getByRole('heading',{name:'Start with your voice.',exact:true})).toBeVisible();
    await expect(page.getByTestId('record-button')).toHaveCount(0);
    const setup = page.getByRole('button',{name:'Practice setup',exact:true});
    await setup.scrollIntoViewIfNeeded();await setup.focus();await page.keyboard.press('Enter');
    await expect(setup).toHaveAttribute('aria-expanded','true');
    await page.getByRole('button',{name:'Add lyrics',exact:true}).click();
    const title=page.getByPlaceholder('Song title'), editor=page.getByPlaceholder('Write your lyrics here...');
    await expect(title).toBeVisible();await expect(page.getByTestId('lyrics-save-indicator')).toHaveText('New draft');
    const words='[Verse]\nHold the tone\nLeave a little space\n\n[Chorus]\nStay here with me';
    await title.fill('QA writing workspace');await editor.fill(words);
    await expect(page.getByTestId('lyrics-save-indicator')).toHaveText('Saved');
    const readSong=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('@lyricflow_songs')||'[]')[0]);
    await expect.poll(async()=>(await readSong())?.lyrics).toBe(words);
    const savedAt=(await readSong()).updatedAt;
    await page.waitForTimeout(1600);expect((await readSong()).updatedAt).toBe(savedAt);
    for(const label of ['Write','Structure','Import','Writer']) {
      const tab=page.getByRole('tab',{name:label+' tab',exact:true});
      const box=await tab.boundingBox();expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width+1);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('tab',{name:'Write tab',exact:true}).focus();await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab',{name:'Structure tab',exact:true})).toHaveAttribute('aria-selected','true');
    await page.getByRole('tab',{name:'Writer tab',exact:true}).click();
    const versions=page.getByRole('button',{name:'Saved versions',exact:true});
    await versions.scrollIntoViewIfNeeded();await versions.focus();await page.keyboard.press('Enter');
    await expect(versions).toHaveAttribute('aria-expanded','true');
    await page.getByRole('button',{name:'Save a lyrics version',exact:true}).click();
    await expect(page.getByText('No saved versions yet.',{exact:true})).toHaveCount(0);
    await page.getByRole('tab',{name:'Write tab',exact:true}).click();await expect(editor).toHaveValue(words);
    await editor.fill('');await expect.poll(async()=>(await readSong())?.lyrics).toBe('');
    await page.reload();await expect(editor).toHaveValue('');await expect(title).toHaveValue('QA writing workspace');
  });
}
