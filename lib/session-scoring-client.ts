import { getApiHeaders, getApiUrl } from '@/lib/query-client';
import type { SessionInsight } from '@/lib/types';

interface SessionScoringResponse {
  transcript: string;
  insights: SessionInsight;
}

export type WhisperStatus = {
  state: 'idle' | 'loading' | 'ready' | 'error';
  lastError?: string | null;
  startedAt?: string | null;
  readyAt?: string | null;
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const value = reader.result;
      if (typeof value !== 'string') {
        reject(new Error('Failed to read recording data'));
        return;
      }
      const base64 = value.includes(',') ? value.split(',')[1] : value;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read recording data'));
    reader.readAsDataURL(blob);
  });
}

async function recordingUriToBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to read recording file: ${response.status}`);
  }
  const blob = await response.blob();
  return blobToBase64(blob);
}

export async function analyzeSessionRecording(params: {
  recordingUri: string;
  lyrics: string;
  durationSeconds: number;
  language?: string;
  accentGoal?: string;
}): Promise<SessionScoringResponse | null> {
  const { recordingUri, lyrics, durationSeconds, language, accentGoal } = params;
  if (!recordingUri || !lyrics.trim()) {
    return null;
  }

  try {
    const audioBase64 = await recordingUriToBase64(recordingUri);
    const url = new URL('/api/session-score', getApiUrl());
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: getApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        lyrics,
        durationSeconds,
        audioBase64,
        language,
        accentGoal,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as SessionScoringResponse;
    if (!data?.insights) {
      return null;
    }
    return data;
  } catch (error) {
    console.error('Session scoring request failed:', error);
    return null;
  }
}

export async function fetchWhisperStatus(): Promise<WhisperStatus | null> {
  try {
    const url = new URL('/api/v1/whisper/status', getApiUrl());
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: getApiHeaders(),
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { state?: WhisperStatus['state'] } & WhisperStatus;
    if (!data?.state) {
      return null;
    }
    return data;
  } catch (error) {
    console.warn('Whisper status request failed:', error);
    return null;
  }
}
