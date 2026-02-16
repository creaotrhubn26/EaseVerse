import { useRef, useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useApp } from '@/lib/AppContext';
import { getApiHeaders, getApiUrl } from '@/lib/query-client';

export type NarrationState = 'idle' | 'loading' | 'playing' | 'error';

export function useNarration() {
  const { settings } = useApp();
  const [state, setState] = useState<NarrationState>('idle');
  const requestIdRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const onDoneRef = useRef<(() => void) | undefined>(undefined);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const webUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  const wasPlayingRef = useRef(false);

  const finishPlayback = useCallback(() => {
    isSpeakingRef.current = false;
    setState('idle');
    wasPlayingRef.current = false;
    const cb = onDoneRef.current;
    onDoneRef.current = undefined;
    cb?.();
  }, []);

  const cleanupWebPlayback = useCallback(() => {
    const audio = webAudioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      try {
        audio.pause();
      } catch {
        // Ignore pause errors.
      }
      audio.src = '';
      webAudioRef.current = null;
    }
    const synth = globalThis.speechSynthesis;
    if (synth) {
      synth.cancel();
    }
    webUtteranceRef.current = null;
  }, []);

  const selectWebVoice = useCallback(
    (voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
      if (voices.length === 0) {
        return null;
      }
      const needle =
        settings.narrationVoice === 'female'
          ? ['female', 'woman', 'zira', 'samantha', 'victoria', 'karen', 'allison', 'ava']
          : ['male', 'man', 'david', 'alex', 'daniel', 'fred', 'tom', 'google us english'];

      const matched = voices.find((voice) => {
        const haystack = `${voice.name} ${voice.voiceURI}`.toLowerCase();
        return needle.some((token) => haystack.includes(token));
      });
      return matched ?? voices[0] ?? null;
    },
    [settings.narrationVoice]
  );

  const speakWithWebFallback = useCallback(
    (text: string, requestId: number) => {
      const synth = globalThis.speechSynthesis;
      if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
        return false;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      const voice = selectWebVoice(synth.getVoices());
      if (voice) {
        utterance.voice = voice;
      }
      utterance.rate = 0.96;
      utterance.onend = () => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        finishPlayback();
      };
      utterance.onerror = () => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        isSpeakingRef.current = false;
        setState('error');
        setTimeout(() => {
          if (requestIdRef.current === requestId) {
            setState('idle');
          }
        }, 1200);
      };

      cleanupWebPlayback();
      webUtteranceRef.current = utterance;
      synth.cancel();
      synth.speak(utterance);
      return true;
    },
    [cleanupWebPlayback, finishPlayback, selectWebVoice]
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    if (state === 'playing' && wasPlayingRef.current && !status.playing && status.currentTime > 0) {
      finishPlayback();
    }
    if (state === 'playing' && status.playing) {
      wasPlayingRef.current = true;
    }
  }, [finishPlayback, status.playing, status.currentTime, state]);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    isSpeakingRef.current = false;
    wasPlayingRef.current = false;
    onDoneRef.current = undefined;
    cleanupWebPlayback();
    try {
      player.pause();
      player.replace(null);
    } catch {
      // Ignore stop errors.
    }
    setState('idle');
  }, [cleanupWebPlayback, player]);

  const speak = useCallback(async (text: string, onDone?: () => void) => {
    const thisRequestId = ++requestIdRef.current;
    isSpeakingRef.current = true;
    wasPlayingRef.current = false;
    onDoneRef.current = onDone;

    cleanupWebPlayback();
    try {
      player.pause();
      player.replace(null);
    } catch {
      // Ignore pause/replace errors.
    }

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

      setState('playing');

      if (Platform.OS === 'web' && typeof Audio !== 'undefined') {
        const webAudio = new Audio(dataUri);
        webAudio.preload = 'auto';
        webAudio.onended = () => {
          if (requestIdRef.current !== thisRequestId) {
            return;
          }
          finishPlayback();
        };
        webAudio.onerror = () => {
          if (requestIdRef.current !== thisRequestId) {
            return;
          }
          // Browser autoplay policies can block programmatic playback.
          const started = speakWithWebFallback(text, thisRequestId);
          if (!started) {
            isSpeakingRef.current = false;
            setState('error');
            setTimeout(() => {
              if (requestIdRef.current === thisRequestId) {
                setState('idle');
              }
            }, 1200);
          }
        };
        webAudioRef.current = webAudio;
        void webAudio.play().catch(() => {
          if (requestIdRef.current !== thisRequestId) {
            return;
          }
          const started = speakWithWebFallback(text, thisRequestId);
          if (!started) {
            isSpeakingRef.current = false;
            setState('error');
            setTimeout(() => {
              if (requestIdRef.current === thisRequestId) {
                setState('idle');
              }
            }, 1200);
          }
        });
      } else {
        try {
          player.replace({ uri: dataUri });
        } catch {
          player.replace(dataUri);
        }
        setTimeout(() => {
          if (requestIdRef.current !== thisRequestId) return;
          try {
            player.play();
          } catch {
            // Ignore play errors; status/error state handles recovery.
          }
        }, 80);
      }
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
  }, [cleanupWebPlayback, finishPlayback, player, settings.narrationVoice, speakWithWebFallback]);

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
