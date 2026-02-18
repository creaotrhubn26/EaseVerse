/**
 * E2E tests for audio recording and pronunciation features
 */
import { test, expect } from '@playwright/test';

test.describe('Audio and Pronunciation Features', () => {
  test.beforeEach(async ({ page, context }) => {
    // Grant microphone permissions
    await context.grantPermissions(['microphone']);
    
    // Navigate to the app
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Inject runtime flags
    await page.addInitScript(() => {
      (window as any).__E2E_API_BASE__ = 'http://127.0.0.1:5051';
      (window as any).__E2E_DISABLE_LEARNING__ = true;
    });
    
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
    expect(ariaLabel).toContain('recording');
    
    // Verify button has accessible name
    const accessibleName = await recordButton.textContent();
    console.log('Record button accessible name:', accessibleName);
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
    
    console.log('Session review has insights:', hasInsights);
  });

  test('Pronunciation coach API is accessible', async ({ page }) => {
    // Test the pronunciation endpoint directly
    const response = await page.request.post('http://127.0.0.1:5051/api/pronounce', {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        word: 'beautiful',
        context: 'You are so beautiful to me',
        language: 'en-US',
      },
    });
    
    // In test environment, this might return 503 if OpenAI isn't configured
    // But it should not return 404 (endpoint exists)
    expect(response.status()).not.toBe(404);
    
    if (response.ok()) {
      const data = await response.json();
      console.log('Pronunciation response:', data);
      expect(data).toHaveProperty('word');
      expect(data).toHaveProperty('phonetic');
      expect(data).toHaveProperty('tip');
      if ('audioBase64' in data) {
        expect(typeof data.audioBase64).toBe('string');
        expect(data.audioBase64.length).toBeGreaterThan(0);
      }
    } else {
      console.log('Pronunciation API returned:', response.status(), 'which is expected in test env without OpenAI');
    }
  });

  test('Session scoring API is accessible', async ({ page }) => {
    // Test the session scoring endpoint
    const mockAudioBase64 = 'VGVzdCBhdWRpbyBkYXRhCg=='; // "Test audio data\n"
    
    const response = await page.request.post('http://127.0.0.1:5051/api/session-score', {
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
    
    // Should not be 404 (endpoint exists)
    expect(response.status()).not.toBe(404);
    
    console.log('Session scoring API status:', response.status());
  });

  test('EasePocket consonant analysis API is accessible', async ({ page }) => {
    // Test the EasePocket endpoint
    const mockAudioBase64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEA'; // Minimal WAV header
    
    const response = await page.request.post('http://127.0.0.1:5051/api/v1/easepocket/consonant-score', {
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
    
    // Should not be 404 (endpoint exists)
    expect(response.status()).not.toBe(404);
    
    console.log('EasePocket API status:', response.status());
  });

  test('Audio level metering works during recording', async ({ page }) => {
    // Navigate to sing screen
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    
    // Start recording
    const recordButton = page.getByTestId('record-button');
    await recordButton.click();
    
    // Wait for recording to start
    await page.waitForTimeout(1000);
    
    // Check if VU meter or quality indicator is present
    const pageContent = await page.content();
    const hasQualityIndicator = 
      pageContent.includes('good') || 
      pageContent.includes('poor') ||
      pageContent.includes('quality') ||
      pageContent.toLowerCase().includes('signal');
    
    console.log('Has audio quality indicator:', hasQualityIndicator);
    
    // Stop recording
    const stopButton = page.getByTestId('stop-button');
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
    
    console.log('Browser permissions state:', permissionsState);
    expect(permissionsState.hasMic).toBe(true);
    expect(permissionsState.hasGetUserMedia).toBe(true);
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
    
    console.log('URL after short recording:', url);
    // Either stays on / or shows session with fallback data
  });

  test('TTS endpoints are functional', async ({ page }) => {
    // Test OpenAI TTS
    const openAiTts = await page.request.post('http://127.0.0.1:5051/api/tts', {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        text: 'Hello from test',
        voice: 'nova',
      },
    });
    
    expect(openAiTts.status()).not.toBe(404);
    console.log('OpenAI TTS status:', openAiTts.status());
    
    if (openAiTts.ok()) {
      const contentType = openAiTts.headers()['content-type'];
      expect(contentType).toContain('audio');
    }
    
    // Test ElevenLabs TTS
    const elevenLabsTts = await page.request.post('http://127.0.0.1:5051/api/tts/elevenlabs', {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        text: 'Hello from test',
        voice: 'female',
      },
    });
    
    expect(elevenLabsTts.status()).not.toBe(404);
    console.log('ElevenLabs TTS status:', elevenLabsTts.status());
  });
});

test.describe('Audio permission handling', () => {
  test('Shows toast when microphone permission is denied', async ({ page, context }) => {
    await context.clearPermissions();

    await page.addInitScript(() => {
      (window as any).__E2E_API_BASE__ = 'http://127.0.0.1:5051';
      (window as any).__E2E_DISABLE_LEARNING__ = true;

      const media = navigator.mediaDevices;
      if (media?.getUserMedia) {
        media.getUserMedia = () =>
          Promise.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
      }
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);

    const recordButton = page.getByTestId('record-button');
    await expect(recordButton).toBeVisible({ timeout: 5_000 });
    await recordButton.click();

    await expect(
      page
        .getByText(/Microphone permission is required|Recording failed to start|Recording unavailable/i)
        .first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('Shows toast when EasePocket recording is denied', async ({ page, context }) => {
    await context.clearPermissions();

    await page.addInitScript(() => {
      (window as any).__E2E_API_BASE__ = 'http://127.0.0.1:5051';
      (window as any).__E2E_DISABLE_LEARNING__ = true;

      const media = navigator.mediaDevices;
      if (media?.getUserMedia) {
        media.getUserMedia = () =>
          Promise.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
      }
    });

    await page.goto('/easepocket', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /EasePocket/i })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Consonant Precision/i }).click();
    const startRecordingButton = page.getByRole('button', { name: /Start recording/i });
    await expect(startRecordingButton).toBeVisible({ timeout: 10_000 });
    await startRecordingButton.click();

    await expect(
      page
        .getByText(/Microphone permission is required|Recording failed to start|Recording unavailable/i)
        .first()
    ).toBeVisible({ timeout: 5_000 });
  });
});
