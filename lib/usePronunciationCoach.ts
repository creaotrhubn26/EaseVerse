import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useApp } from '@/lib/AppContext';
import { getApiHeaders, getApiUrl } from '@/lib/query-client';

export interface PronunciationResult {
  word: string;
  phonetic: string;
  tip: string;
  slow: string;
}

export type CoachState = 'idle' | 'loading' | 'playing' | 'ready';

export function usePronunciationCoach() {
  const { settings } = useApp();
  const [state, setState] = useState<CoachState>('idle');
  const [result, setResult] = useState<PronunciationResult | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);

  const audioSource = useMemo(() => (audioUri ? { uri: audioUri } : null), [audioUri]);
  const player = useAudioPlayer(audioSource);
  const status = useAudioPlayerStatus(player);

  const wasPlayingRef = useRef(false);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const lastPronounceArgsRef = useRef<{ word: string; context?: string; genre?: string } | null>(
    null
  );

  useEffect(() => {
    if (state === 'playing' && wasPlayingRef.current && !status.playing && status.currentTime > 0) {
      setState('ready');
      wasPlayingRef.current = false;
    }
    if (state === 'playing' && status.playing) {
      wasPlayingRef.current = true;
    }
  }, [status.playing, status.currentTime, state]);

  const pronounce = useCallback(async (word: string, context?: string, genre?: string) => {
    setState('loading');
    setResult(null);
    setAudioUri(null);
    wasPlayingRef.current = false;
    lastPronounceArgsRef.current = { word, context, genre };

    try {
      const baseUrl = getApiUrl();
      const url = new URL('/api/v1/pronounce', baseUrl);

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          word,
          context,
          genre,
          language: settings.language,
          accentGoal: settings.accentGoal,
        }),
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
        const canUseWebSpeech =
          Platform.OS === 'web' &&
          typeof window !== 'undefined' &&
          typeof window.speechSynthesis !== 'undefined';

        if (canUseWebSpeech) {
          try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(data.slow || word);
            speechUtteranceRef.current = utterance;
            setState('playing');
            utterance.onend = () => {
              setState('ready');
              speechUtteranceRef.current = null;
            };
            utterance.onerror = () => {
              setState('ready');
              speechUtteranceRef.current = null;
            };
            window.speechSynthesis.speak(utterance);
          } catch {
            setState('ready');
          }
        } else {
          setState('ready');
        }
      }
    } catch (err) {
      console.error('Pronunciation coach error:', err);
      setState('idle');
    }
  }, [player, settings.accentGoal, settings.language]);

  const replay = useCallback(async () => {
    if (!result) return;
    if (audioUri) {
      wasPlayingRef.current = false;
      setState('playing');
      try {
        player.seekTo(0);
        player.play();
      } catch {
        const previous = lastPronounceArgsRef.current;
        await pronounce(result.word, previous?.context, previous?.genre);
      }
    } else {
      const previous = lastPronounceArgsRef.current;
      await pronounce(result.word, previous?.context, previous?.genre);
    }
  }, [result, audioUri, player, pronounce]);

  const dismiss = useCallback(() => {
    try { player.pause(); } catch {}
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined') {
      window.speechSynthesis.cancel();
    }
    speechUtteranceRef.current = null;
    setAudioUri(null);
    setState('idle');
    setResult(null);
    wasPlayingRef.current = false;
  }, [player]);

  return { state, result, pronounce, replay, dismiss };
}
