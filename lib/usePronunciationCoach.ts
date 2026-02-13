import { useState, useCallback, useRef } from 'react';
import { Audio } from 'expo-av';
import { getApiUrl } from '@/lib/query-client';

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
  const soundRef = useRef<Audio.Sound | null>(null);

  const cleanup = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
  }, []);

  const pronounce = useCallback(async (word: string, context?: string) => {
    await cleanup();
    setState('loading');
    setResult(null);

    try {
      const baseUrl = getApiUrl();
      const url = new URL('/api/pronounce', baseUrl);

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        const { sound } = await Audio.Sound.createAsync(
          { uri: dataUri },
          { shouldPlay: true }
        );
        soundRef.current = sound;
        setState('playing');

        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) return;
          if (status.didJustFinish) {
            setState('ready');
            sound.unloadAsync().catch(() => {});
            soundRef.current = null;
          }
        });
      } else {
        setState('ready');
      }
    } catch (err) {
      console.error('Pronunciation coach error:', err);
      setState('idle');
    }
  }, [cleanup]);

  const replay = useCallback(async () => {
    if (!result) return;
    await pronounce(result.word);
  }, [result, pronounce]);

  const dismiss = useCallback(() => {
    cleanup();
    setState('idle');
    setResult(null);
  }, [cleanup]);

  return { state, result, pronounce, replay, dismiss };
}
