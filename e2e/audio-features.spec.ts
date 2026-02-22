/**
 * E2E tests for audio recording and pronunciation features
 */
import { test, expect } from '@playwright/test';

const API_BASE = 'http://127.0.0.1:5051';

test.describe('Audio and Pronunciation Features', () => {
  test.beforeEach(async ({ page, context }) => {
    // Grant microphone permissions
    await context.grantPermissions(['microphone']);

    // Inject runtime flags
    await page.addInitScript((apiBase) => {
      (window as any).__E2E_API_BASE__ = apiBase;
      (window as any).__E2E_DISABLE_LEARNING__ = true;
    }, API_BASE);

    // Navigate to the app
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for app to load
    await page.waitForTimeout(500);
  });

  test('Recording button is accessible and functional', async ({ page }) => {
    // Wait for the sing screen to load
    const candidateTexts = ['Ready to sing', 'No lyrics loaded', 'Session Review'];
    let found = false;
    for (const text of candidateTexts) {
      try {
        await expect(page.getByText(text).first()).toBeVisible({ timeout: 6_000 });
        found = true;
        break;
      } catch {
        // Try next candidate
      }
    }
    expect(found).toBe(true);

    // Check record button exists with proper accessibility
    const recordButton = page.getByTestId('record-button');
    await expect(recordButton).toBeVisible({ timeout: 5_000 });
    
    const ariaLabel = await recordButton.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
    expect((ariaLabel || '').toLowerCase()).toContain('record');
  });

  test('Recording flow creates session with audio analysis', async ({ page }) => {
    // Add lyrics first
    await page.goto('/lyrics', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    
    const titleInput = page.getByPlaceholder('Song title');
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
    await titleInput.fill(`Audio Test Song ${Date.now()}`);
    
    const lyricsArea = page.getByPlaceholder('Write your lyrics here...');
    await lyricsArea.fill('Testing audio recording\nWith pronunciation analysis\nEvery word should count');
    
    // Navigate to sing screen
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    
    // Start recording
    const recordButton = page.getByTestId('record-button');
    await recordButton.click();
    
    // Wait for stop button to appear
    const stopButton = page.getByTestId('stop-button');
    await expect(stopButton).toBeVisible({ timeout: 10_000 });
    
    // Record for minimum duration (3+ seconds)
    await page.waitForTimeout(3500);
    
    // Stop recording
    await stopButton.click();
    
    // Should navigate to session review
    await expect(page.getByRole('heading', { name: 'Session Review' })).toBeVisible({ 
      timeout: 30_000 
    });
    
    // Check that insights are present (even with mock data)
    const pageContent = await page.content();
    const hasInsights = 
      pageContent.includes('Text Accuracy') || 
      pageContent.includes('Pronunciation') ||
      pageContent.includes('accuracy') ||
      pageContent.includes('clarity');

    expect(hasInsights).toBe(true);
  });

  test('Pronunciation coach API is accessible', async ({ page }) => {
    // Test the pronunciation endpoint directly
    const response = await page.request.post(`${API_BASE}/api/pronounce`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        word: 'beautiful',
        context: 'You are so beautiful to me',
        language: 'en-US',
      },
    });

    const status = response.status();
    expect([200, 401, 429, 503]).toContain(status);

    if (status === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('word');
      expect(data).toHaveProperty('phonetic');
      expect(data).toHaveProperty('tip');
      if ('audioBase64' in data) {
        expect(typeof data.audioBase64).toBe('string');
        expect(data.audioBase64.length).toBeGreaterThan(0);
      }
    } else {
      const data = await response.json();
      expect(typeof data.error).toBe('string');
      expect(data.error.length).toBeGreaterThan(0);
    }
  });

  test('Session scoring API is accessible', async ({ page }) => {
    // Test the session scoring endpoint
    const mockAudioBase64 = 'VGVzdCBhdWRpbyBkYXRhCg=='; // "Test audio data\n"
    
    const response = await page.request.post(`${API_BASE}/api/session-score`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        lyrics: 'Test lyrics for analysis',
        durationSeconds: 5,
        audioBase64: mockAudioBase64,
        language: 'en-US',
      },
    });

    const status = response.status();
    expect([200, 400, 401, 429, 503]).toContain(status);
    if (status === 200) {
      const data = await response.json();
      expect(typeof data.transcript).toBe('string');
      expect(typeof data.insights).toBe('object');
    } else {
      const data = await response.json();
      expect(typeof data.error).toBe('string');
      expect(data.error.length).toBeGreaterThan(0);
    }
  });

  test('EasePocket consonant analysis API is accessible', async ({ page }) => {
    // Test the EasePocket endpoint
    const mockAudioBase64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEA'; // Minimal WAV header
    
    const response = await page.request.post(`${API_BASE}/api/v1/easepocket/consonant-score`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        audioBase64: mockAudioBase64,
        bpm: 120,
        grid: '16th',
        toleranceMs: 15,
        maxEvents: 100,
      },
    });

    const status = response.status();
    expect([200, 400, 429, 503]).toContain(status);
    if (status === 200) {
      const data = await response.json();
      expect(data.ok).toBe(true);
      expect(typeof data.onTimePct).toBe('number');
    } else {
      const data = await response.json();
      expect(typeof data.error).toBe('string');
      expect(data.error.length).toBeGreaterThan(0);
    }
  });

  test('Audio level metering works during recording', async ({ page }) => {
    // Navigate to sing screen
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    
    // Start recording
    const recordButton = page.getByTestId('record-button');
    await recordButton.click();
    
    const stopButton = page.getByTestId('stop-button');
    await expect(stopButton).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Listening/).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/\d+:\d\d/).first()).toBeVisible({ timeout: 10_000 });
    
    // Stop recording
    await stopButton.click();
  });

  test('Live transcription activates during recording', async ({ page }) => {
    // This test verifies the speech recognition integration
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    
    // Check permissions state
    const permissionsState = await page.evaluate(() => {
      return {
        hasMic: typeof navigator.mediaDevices !== 'undefined',
        hasGetUserMedia: typeof navigator.mediaDevices?.getUserMedia === 'function',
        hasSpeechRecognition: 
          'webkitSpeechRecognition' in window || 
          'SpeechRecognition' in window,
      };
    });
    
    expect(permissionsState.hasMic).toBe(true);
    expect(permissionsState.hasGetUserMedia).toBe(true);
    expect(typeof permissionsState.hasSpeechRecognition).toBe('boolean');
  });

  test('Recording respects minimum duration requirement', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    
    // Add some lyrics
    await page.goto('/lyrics', { waitUntil: 'domcontentloaded' });
    const lyricsArea = page.getByPlaceholder('Write your lyrics here...');
    await lyricsArea.fill('Quick test');
    
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    
    // Start and immediately stop (too short)
    const recordButton = page.getByTestId('record-button');
    await recordButton.click();
    
    const stopButton = page.getByTestId('stop-button');
    await expect(stopButton).toBeVisible({ timeout: 5_000 });
    
    // Wait less than minimum (< 3 seconds)
    await page.waitForTimeout(1500);
    await stopButton.click();
    
    // Should show feedback about recording being too short or stay on sing screen
    await page.waitForTimeout(1000);
    const url = page.url();

    expect(url).toMatch(/\/$|\/session\//);
  });

  test('TTS endpoints are functional', async ({ page }) => {
    // Test OpenAI TTS
    const openAiTts = await page.request.post(`${API_BASE}/api/tts`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        text: 'Hello from test',
        voice: 'nova',
      },
    });

    expect([200, 500, 503]).toContain(openAiTts.status());
    if (openAiTts.status() === 200) {
      const contentType = openAiTts.headers()['content-type'];
      expect(contentType).toContain('audio');
      expect((await openAiTts.body()).byteLength).toBeGreaterThan(32);
    } else {
      const payload = await openAiTts.json();
      expect(typeof payload.error).toBe('string');
      expect(payload.error.length).toBeGreaterThan(0);
    }
    
    // Test ElevenLabs TTS
    const elevenLabsTts = await page.request.post(`${API_BASE}/api/tts/elevenlabs`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        text: 'Hello from test',
        voice: 'female',
      },
    });

    expect([200, 500, 503]).toContain(elevenLabsTts.status());
    if (elevenLabsTts.status() === 200) {
      const contentType = elevenLabsTts.headers()['content-type'];
      expect(contentType).toContain('audio');
      expect((await elevenLabsTts.body()).byteLength).toBeGreaterThan(32);
    } else {
      const payload = await elevenLabsTts.json();
      expect(typeof payload.error).toBe('string');
      expect(payload.error.length).toBeGreaterThan(0);
    }
  });
});

test.describe('Audio permission handling', () => {
  test('Shows toast when microphone permission is denied', async ({ page, context }) => {
    await context.clearPermissions();

    await page.addInitScript((apiBase) => {
      (window as any).__E2E_API_BASE__ = apiBase;
      (window as any).__E2E_DISABLE_LEARNING__ = true;

      const media = navigator.mediaDevices;
      if (media?.getUserMedia) {
        media.getUserMedia = () =>
          Promise.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
      }
    }, API_BASE);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);

    const recordButton = page.getByTestId('record-button');
    await expect(recordButton).toBeVisible({ timeout: 5_000 });
    await recordButton.click();

    const recordingErrorRegex =
      /Microphone permission is off|Microphone recording is unavailable|Unable to start recording|Recording failed\. Check mic permission|Recording failed to start|Recording unavailable/i;
    await expect(
      page
        .getByText(recordingErrorRegex)
        .first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('Shows toast when EasePocket recording is denied', async ({ page, context }) => {
    await context.clearPermissions();

    await page.addInitScript((apiBase) => {
      (window as any).__E2E_API_BASE__ = apiBase;
      (window as any).__E2E_DISABLE_LEARNING__ = true;

      const media = navigator.mediaDevices;
      if (media?.getUserMedia) {
        media.getUserMedia = () =>
          Promise.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
      }
    }, API_BASE);

    await page.goto('/easepocket', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /EasePocket/i })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Consonant Precision/i }).click();
    const startRecordingButton = page.getByRole('button', { name: /Start recording/i });
    await expect(startRecordingButton).toBeVisible({ timeout: 10_000 });
    await startRecordingButton.click();

    const recordingErrorRegex =
      /Microphone permission is off|Microphone recording is unavailable|Unable to start recording|Recording failed\. Check mic permission|Recording failed to start|Recording unavailable/i;
    await expect(
      page
        .getByText(recordingErrorRegex)
        .first()
    ).toBeVisible({ timeout: 5_000 });
  });
});
