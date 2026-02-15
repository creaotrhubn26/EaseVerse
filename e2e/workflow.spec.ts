import { test, expect } from '@playwright/test';

test('E2E workflow: Lyrics -> Sync -> Sing -> Review -> Practice Loop', async ({ page, request }) => {
  const songTitle = `Workflow Song ${Date.now()}`;
  const initialLyrics = 'Hello world\nThis is test';
  const updatedLyrics = `${initialLyrics}\nNew line from collab`;

  // Seed a remote collab lyrics draft that should match our local song by title.
  const externalTrackId = `pw-track-${Date.now()}`;
  const seed = await request.post('/api/v1/collab/lyrics', {
    data: {
      externalTrackId,
      projectId: 'proj-e2e',
      title: songTitle,
      artist: 'QA',
      lyrics: updatedLyrics,
      source: 'playwright',
    },
  });
  expect(seed.ok()).toBeTruthy();

  // Start from the app root, then navigate via tabs (more stable than deep-linking).
  await page.goto('/');

  // Create a song locally.
  await page.getByRole('tab', { name: /Lyrics/ }).click();
  await expect(page.getByPlaceholder('Song title')).toBeVisible({ timeout: 10_000 });
  await page.getByPlaceholder('Song title').fill(songTitle);
  await page.getByPlaceholder('Write your lyrics here...').fill(initialLyrics);

  // Autosave should trigger a toast.
  await expect(page.getByText('Saved & ready for live')).toBeVisible({ timeout: 10_000 });

  // Update settings + sync in Profile.
  await page.getByRole('tab', { name: /Profile/ }).click();
  await expect(page.getByRole('heading', { name: 'Lyrics Sync' })).toBeVisible({ timeout: 10_000 });

  // Verify lyrics updated from sync.
  const syncButton = page.getByRole('button', { name: /Sync Latest Lyrics/ });
  await expect(syncButton).toBeVisible({ timeout: 10_000 });
  await syncButton.evaluate((el) => (el as HTMLElement).click());

  await page.getByRole('tab', { name: /Lyrics/ }).click();
  await expect(page.getByPlaceholder('Write your lyrics here...')).toHaveValue(updatedLyrics, {
    timeout: 20_000,
  });

  // Sing and create a session.
  await page.getByRole('tab', { name: /Sing/ }).click();
  await expect(page.getByRole('heading', { name: songTitle })).toBeVisible({ timeout: 10_000 });

  await page.getByTestId('record-button').click();

  // Wait long enough to pass the 3s minimum take duration.
  await expect(page.getByTestId('stop-button')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(3_800);
  await page.getByTestId('stop-button').click();

  await expect(page.getByText('Session Review')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Added to sessions')).toBeVisible({ timeout: 10_000 });

  // Practice loop should load and attempt TTS.
  await page.getByRole('button', { name: 'Open practice loop' }).click();
  await expect(page.getByRole('heading', { name: 'Practice Loop' })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Start practice loop' }).click();
  // If OpenAI keys are not configured, this will show the TTS error state.
  await expect(
    page.getByText(/Unable to generate loop audio|Preparing Audio\.\.\./)
  ).toBeVisible({ timeout: 20_000 });
});
