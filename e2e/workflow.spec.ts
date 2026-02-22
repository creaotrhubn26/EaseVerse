import { test, expect } from '@playwright/test';

test('E2E workflow: Lyrics -> Sync -> Sing -> Review -> Practice Loop', async ({ page, request, context }) => {
  const apiBase =
    process.env.E2E_API_BASE ||
    process.env.EXPO_PUBLIC_API_URL ||
    `http://127.0.0.1:${process.env.E2E_PORT || '5051'}`;
  const lyricsSyncSource = 'playwright';
  const lyricsSyncProjectId = 'proj-e2e';
  await page.addInitScript(
    (payload) => {
      const runtime = window as Window & {
        __E2E_API_BASE__?: string;
        __E2E_LYRICS_SYNC_SOURCE__?: string;
        __E2E_LYRICS_SYNC_PROJECT_ID__?: string;
      };
      runtime.__E2E_API_BASE__ = payload.apiBase;
      runtime.__E2E_LYRICS_SYNC_SOURCE__ = payload.lyricsSyncSource;
      runtime.__E2E_LYRICS_SYNC_PROJECT_ID__ = payload.lyricsSyncProjectId;
    },
    { apiBase, lyricsSyncSource, lyricsSyncProjectId }
  );
  await context.grantPermissions(['microphone']);
  const songTitle = `Workflow Song ${Date.now()}`;
  const initialLyrics = 'Hello world\nThis is test';
  const updatedLyrics = `${initialLyrics}\nNew line from collab`;

  // Seed a remote collab lyrics draft that should match our local song by title.
  const externalTrackId = `pw-track-${Date.now()}`;
  const seed = await request.post('/api/v1/collab/lyrics', {
    data: {
      externalTrackId,
      projectId: lyricsSyncProjectId,
      title: songTitle,
      artist: 'QA',
      lyrics: updatedLyrics,
      source: lyricsSyncSource,
    },
  });
  expect(seed.ok()).toBeTruthy();

  // Start from the app root to initialize app state and injected API base.
  await page.goto('/');

  // Create a song locally.
  await page.goto('/lyrics');
  await expect(page.getByPlaceholder('Song title')).toBeVisible({ timeout: 10_000 });
  await page.getByPlaceholder('Song title').fill(songTitle);
  await page.getByPlaceholder('Write your lyrics here...').fill(initialLyrics);

  // Autosave should settle into the inline save indicator.
  const saveIndicator = page.getByTestId('lyrics-save-indicator');
  await expect(saveIndicator).toBeVisible({ timeout: 10_000 });
  await expect(saveIndicator).toContainText('Saved', { timeout: 10_000 });
  await expect(page.getByTestId('lyrics-last-saved')).not.toHaveText('Not saved yet');

  // Update settings + sync in Profile.
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Lyrics Sync' })).toBeVisible({ timeout: 10_000 });

  // Verify lyrics updated from sync.
  const syncButton = page.getByRole('button', { name: /Sync Latest Lyrics/ });
  await expect(syncButton).toBeVisible({ timeout: 10_000 });
  const syncResponsePromise = page.waitForResponse((response) => {
    return (
      response.request().method() === 'GET' &&
      response.url().includes('/api/v1/collab/lyrics?') &&
      response.url().includes('source=playwright') &&
      response.url().includes('projectId=proj-e2e')
    );
  });
  await syncButton.click();
  const syncResponse = await syncResponsePromise;
  expect(syncResponse.ok()).toBeTruthy();
  await expect(
    page.getByText(/Synced latest lyrics\.|Lyrics synced\. No remote lyric drafts found/)
  ).toBeVisible({ timeout: 10_000 });

  await page.goto('/lyrics');
  await expect(page.getByPlaceholder('Write your lyrics here...')).toHaveValue(updatedLyrics, {
    timeout: 20_000,
  });

  // Sing and create a session.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: songTitle })).toBeVisible({ timeout: 10_000 });

  await page.getByTestId('record-button').click();

  // Wait long enough to pass the 3s minimum take duration.
  await expect(page.getByTestId('stop-button')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(3_800);
  await page.getByTestId('stop-button').click();

  // Use the screen heading, not any instructional copy that might mention "Session Review".
  await expect(page.getByRole('heading', { name: 'Session Review' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Added to sessions')).toBeVisible({ timeout: 10_000 });

  // Practice loop should load and attempt TTS.
  await page.getByRole('button', { name: 'Open practice loop' }).click();
  await expect(page.getByRole('heading', { name: 'Practice Loop' })).toBeVisible({ timeout: 15_000 });

  const ttsResponsePromise = page.waitForResponse((response) => {
    return (
      response.request().method() === 'POST' &&
      (response.url().includes('/api/tts/elevenlabs') || response.url().includes('/api/tts'))
    );
  });
  await page.getByRole('button', { name: 'Start practice loop' }).click();
  const ttsResponse = await ttsResponsePromise;
  expect(ttsResponse.status()).toBeGreaterThanOrEqual(200);
  expect(ttsResponse.status()).toBeLessThan(600);
  await expect(
    page.getByText(/Stop Loop|Unable to generate loop audio|Unable to start loop playback on this device\./)
  ).toBeVisible({ timeout: 20_000 });
});
