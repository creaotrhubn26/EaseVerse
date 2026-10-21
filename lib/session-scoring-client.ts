import { getApiHeaders, getApiUrl } from '@/lib/query-client';
import type { SessionInsight } from '@/lib/types';
import {matchLyricTranscript,type LyricMatch} from '@/shared/lyric-match';
import { recordingBase64 } from './recording-base64';
import { authedFetch } from './authed-fetch';

interface SessionScoringResponse {
  transcript: string;
  insights: SessionInsight;
  comparison: LyricMatch;
}

export type WhisperStatus = {
  state: 'idle' | 'loading' | 'ready' | 'error';
  lastError?: string | null;
  startedAt?: string | null;
  readyAt?: string | null;
};

export async function analyzeSessionRecording(params: {
  recordingUri: string; lyrics: string; durationSeconds: number; language?: string; accentGoal?: string;
  token?: string | null; signal?: AbortSignal; throwOnError?: boolean;
}): Promise<SessionScoringResponse | null> {
  try {
    if (!params.recordingUri || !params.lyrics.trim()) throw new Error('Add lyrics before comparing this take.');
    if (params.durationSeconds > 180) throw new Error('Choose a take of 3 minutes or less for cloud analysis.');
    const audioBase64 = await recordingBase64(params.recordingUri);
    if (params.signal?.aborted) throw new Error('Analysis cancelled.');
    const controller = new AbortController();
    const cancel = () => controller.abort();
    params.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, 30000);
    try {
      const response = await authedFetch('/api/v1/session-score', params.token ?? null, {
        method: 'POST', signal: controller.signal,
        body: JSON.stringify({ lyrics: params.lyrics, durationSeconds: params.durationSeconds, audioBase64, language: params.language, consent: true }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const messages: Record<number,string> = {401:'Sign in to use cloud analysis.',403:'Your account needs an active studio invitation or approved access.',413:'This recording is too large. Choose a shorter take.',422:'No words were recognised. Try a clearer vocal take.',429:'The hourly analysis limit has been reached. Try again later.',503:'Transcription is temporarily unavailable. Your recording is still saved.'};
        throw new Error(messages[response.status] ?? 'Analysis could not finish. Your recording is still saved.');
      }
      if (typeof payload?.transcript!=='string'||!payload.transcript.trim()||payload.transcript.length>30000||payload.provider!=='openai'||payload.method!=='transcription_text_match') throw new Error('No usable analysis was returned. Try again.');
      // Recompute the deterministic comparison; never persist unvalidated provider scores.
      const comparison=matchLyricTranscript(params.lyrics,payload.transcript);
      return {transcript:payload.transcript,comparison,insights:{textAccuracy:comparison.score,analysisAvailable:true,pronunciationClarity:0,timingConsistency:'low',topToFix:comparison.wordsToCheck.map(word=>({word,reason:'Not matched in the transcript. Listen back and check this word.'}))}};
    } finally { clearTimeout(timer); params.signal?.removeEventListener('abort', cancel); }
  } catch (error) {
    if (params.throwOnError) {
      if(error instanceof Error&&error.name==='AbortError')throw new Error('Analysis stopped or timed out. Your recording is still saved; you can retry.');
      throw error;
    }
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
