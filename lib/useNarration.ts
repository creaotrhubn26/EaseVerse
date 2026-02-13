import { useRef, useState, useCallback } from 'react';
import { Audio } from 'expo-av';
import { getApiUrl } from '@/lib/query-client';

export type NarrationState = 'idle' | 'loading' | 'playing' | 'error';

export function useNarration() {
  const [state, setState] = useState<NarrationState>('idle');
  const soundRef = useRef<Audio.Sound | null>(null);
  const abortRef = useRef(false);

  const stop = useCallback(async () => {
    abortRef.current = true;
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }
    setState('idle');
  }, []);

  const speak = useCallback(async (text: string, onDone?: () => void) => {
    abortRef.current = false;

    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }

    setState('loading');

    try {
      const baseUrl = getApiUrl();
      const url = new URL('/api/tts', baseUrl);

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'nova' }),
      });

      if (!response.ok) {
        throw new Error(`TTS failed: ${response.status}`);
      }

      if (abortRef.current) return;

      const blob = await response.blob();
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      if (abortRef.current) return;

      const { sound } = await Audio.Sound.createAsync(
        { uri: base64 },
        { shouldPlay: true }
      );

      soundRef.current = sound;
      setState('playing');

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          soundRef.current = null;
          setState('idle');
          onDone?.();
        }
      });
    } catch (err) {
      console.error('Narration error:', err);
      setState('error');
      setTimeout(() => setState('idle'), 2000);
    }
  }, []);

  const speakSequence = useCallback(async (texts: string[], onAllDone?: () => void) => {
    abortRef.current = false;

    for (let i = 0; i < texts.length; i++) {
      if (abortRef.current) return;

      await new Promise<void>((resolve) => {
        speak(texts[i], () => {
          resolve();
        });
      });

      if (abortRef.current) return;

      await new Promise(r => setTimeout(r, 800));
    }

    onAllDone?.();
  }, [speak]);

  return { state, speak, speakSequence, stop };
}
