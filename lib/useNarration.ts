import { useRef, useState, useCallback } from 'react';
import { Audio } from 'expo-av';
import { getApiUrl } from '@/lib/query-client';

export type NarrationState = 'idle' | 'loading' | 'playing' | 'error';

export function useNarration() {
  const [state, setState] = useState<NarrationState>('idle');
  const requestIdRef = useRef(0);
  const soundRef = useRef<Audio.Sound | null>(null);
  const isSpeakingRef = useRef(false);

  const cleanup = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync().catch(() => {});
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    } catch {}
  }, []);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    isSpeakingRef.current = false;
    cleanup();
    setState('idle');
  }, [cleanup]);

  const speak = useCallback(async (text: string, onDone?: () => void) => {
    const thisRequestId = ++requestIdRef.current;
    isSpeakingRef.current = true;

    await cleanup();

    if (requestIdRef.current !== thisRequestId) return;

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

      if (requestIdRef.current !== thisRequestId) return;

      const blob = await response.blob();
      const reader = new FileReader();
      const dataUri = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      if (requestIdRef.current !== thisRequestId) return;

      const { sound } = await Audio.Sound.createAsync(
        { uri: dataUri },
        { shouldPlay: true }
      );

      if (requestIdRef.current !== thisRequestId) {
        await sound.unloadAsync().catch(() => {});
        return;
      }

      soundRef.current = sound;
      setState('playing');

      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish && requestIdRef.current === thisRequestId) {
          isSpeakingRef.current = false;
          soundRef.current = null;
          sound.unloadAsync().catch(() => {});
          setState('idle');
          onDone?.();
        }
      });
    } catch (err) {
      if (requestIdRef.current !== thisRequestId) return;
      console.error('Narration error:', err);
      isSpeakingRef.current = false;
      setState('error');
      setTimeout(() => {
        if (requestIdRef.current === thisRequestId) {
          setState('idle');
        }
      }, 2000);
    }
  }, [cleanup]);

  const speakSequence = useCallback(async (texts: string[], onAllDone?: () => void) => {
    const seqId = requestIdRef.current;

    for (let i = 0; i < texts.length; i++) {
      if (requestIdRef.current !== seqId) return;

      await new Promise<void>((resolve) => {
        speak(texts[i], () => {
          resolve();
        });
      });

      if (requestIdRef.current !== seqId) return;

      await new Promise(r => setTimeout(r, 500));
    }

    onAllDone?.();
  }, [speak]);

  return { state, speak, speakSequence, stop, isSpeaking: isSpeakingRef };
}
