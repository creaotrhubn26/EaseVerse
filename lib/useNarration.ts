import { useRef, useState, useCallback, useEffect } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { getApiUrl } from '@/lib/query-client';

export type NarrationState = 'idle' | 'loading' | 'playing' | 'error';

export function useNarration() {
  const [state, setState] = useState<NarrationState>('idle');
  const abortRef = useRef(false);
  const onDoneRef = useRef<(() => void) | undefined>(undefined);

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    if (state === 'playing' && !status.playing && status.currentTime > 0 && status.currentTime >= status.duration - 0.1) {
      setState('idle');
      const cb = onDoneRef.current;
      onDoneRef.current = undefined;
      cb?.();
    }
  }, [state, status.playing, status.currentTime, status.duration]);

  const stop = useCallback(() => {
    abortRef.current = true;
    onDoneRef.current = undefined;
    try {
      player.pause();
    } catch {}
    setState('idle');
  }, [player]);

  const speak = useCallback(async (text: string, onDone?: () => void) => {
    abortRef.current = false;
    onDoneRef.current = undefined;

    try {
      player.pause();
    } catch {}

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
      const dataUri = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      if (abortRef.current) return;

      onDoneRef.current = onDone;
      player.replace(dataUri);
      player.play();
      setState('playing');
    } catch (err) {
      console.error('Narration error:', err);
      setState('error');
      setTimeout(() => setState('idle'), 2000);
    }
  }, [player]);

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
