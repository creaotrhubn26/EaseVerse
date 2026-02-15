import { useRef, useState, useCallback, useEffect } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useApp } from '@/lib/AppContext';
import { getApiHeaders, getApiUrl } from '@/lib/query-client';

export type NarrationState = 'idle' | 'loading' | 'playing' | 'error';

export function useNarration() {
  const { settings } = useApp();
  const [state, setState] = useState<NarrationState>('idle');
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const onDoneRef = useRef<(() => void) | undefined>(undefined);

  const player = useAudioPlayer(audioUri ? { uri: audioUri } : null);
  const status = useAudioPlayerStatus(player);

  const wasPlayingRef = useRef(false);

  useEffect(() => {
    if (state === 'playing' && wasPlayingRef.current && !status.playing && status.currentTime > 0) {
      isSpeakingRef.current = false;
      setState('idle');
      wasPlayingRef.current = false;
      const cb = onDoneRef.current;
      onDoneRef.current = undefined;
      cb?.();
    }
    if (state === 'playing' && status.playing) {
      wasPlayingRef.current = true;
    }
  }, [status.playing, status.currentTime, state]);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    isSpeakingRef.current = false;
    wasPlayingRef.current = false;
    onDoneRef.current = undefined;
    try { player.pause(); } catch {}
    setAudioUri(null);
    setState('idle');
  }, [player]);

  const speak = useCallback(async (text: string, onDone?: () => void) => {
    const thisRequestId = ++requestIdRef.current;
    isSpeakingRef.current = true;
    wasPlayingRef.current = false;
    onDoneRef.current = onDone;

    try { player.pause(); } catch {}
    setAudioUri(null);

    if (requestIdRef.current !== thisRequestId) return;

    setState('loading');

    try {
      const baseUrl = getApiUrl();
      const elevenUrl = new URL('/api/tts/elevenlabs', baseUrl);
      const fallbackUrl = new URL('/api/tts', baseUrl);

      let response: Response | null = null;
      try {
        response = await fetch(elevenUrl.toString(), {
          method: 'POST',
          headers: getApiHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ text, voice: settings.narrationVoice }),
        });
      } catch {
        response = null;
      }

      if (!response || !response.ok) {
        response = await fetch(fallbackUrl.toString(), {
          method: 'POST',
          headers: getApiHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ text, voice: 'nova' }),
        });
      }

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

      setAudioUri(dataUri);
      setState('playing');
      setTimeout(() => {
        if (requestIdRef.current !== thisRequestId) return;
        try { player.play(); } catch {}
      }, 200);
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
  }, [player, settings.narrationVoice]);

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
