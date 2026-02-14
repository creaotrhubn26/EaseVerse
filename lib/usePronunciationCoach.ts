import { useState, useCallback, useRef, useEffect } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { getApiHeaders, getApiUrl } from '@/lib/query-client';

export interface PronunciationResult {
  word: string;
  phonetic: string;
  tip: string;
  slow: string;
}

export type CoachState = 'idle' | 'loading' | 'playing' | 'ready';

export function usePronunciationCoach() {
  const [state, setState] = useState<CoachState>('idle');
  const [result, setResult] = useState<PronunciationResult | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);

  const player = useAudioPlayer(audioUri ? { uri: audioUri } : null);
  const status = useAudioPlayerStatus(player);

  const wasPlayingRef = useRef(false);

  useEffect(() => {
    if (state === 'playing' && wasPlayingRef.current && !status.playing && status.currentTime > 0) {
      setState('ready');
      wasPlayingRef.current = false;
    }
    if (state === 'playing' && status.playing) {
      wasPlayingRef.current = true;
    }
  }, [status.playing, status.currentTime, state]);

  const pronounce = useCallback(async (word: string, context?: string) => {
    setState('loading');
    setResult(null);
    setAudioUri(null);
    wasPlayingRef.current = false;

    try {
      const baseUrl = getApiUrl();
      const url = new URL('/api/pronounce', baseUrl);

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ word, context }),
      });

      if (!response.ok) throw new Error(`Failed: ${response.status}`);

      const data = await response.json();
      const pronunciation: PronunciationResult = {
        word: data.word,
        phonetic: data.phonetic,
        tip: data.tip,
        slow: data.slow,
      };
      setResult(pronunciation);

      const audioBase64 = data.audioBase64;
      if (audioBase64) {
        const dataUri = `data:audio/mpeg;base64,${audioBase64}`;
        setAudioUri(dataUri);
        setState('playing');
        setTimeout(() => {
          try { player.play(); } catch {}
        }, 200);
      } else {
        setState('ready');
      }
    } catch (err) {
      console.error('Pronunciation coach error:', err);
      setState('idle');
    }
  }, [player]);

  const replay = useCallback(async () => {
    if (!result) return;
    if (audioUri) {
      wasPlayingRef.current = false;
      setState('playing');
      try {
        player.seekTo(0);
        player.play();
      } catch {
        await pronounce(result.word);
      }
    } else {
      await pronounce(result.word);
    }
  }, [result, audioUri, player, pronounce]);

  const dismiss = useCallback(() => {
    try { player.pause(); } catch {}
    setAudioUri(null);
    setState('idle');
    setResult(null);
    wasPlayingRef.current = false;
  }, [player]);

  return { state, result, pronounce, replay, dismiss };
}
