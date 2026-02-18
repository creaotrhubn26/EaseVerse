import { useRef, useState, useCallback, useEffect } from 'react';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  AudioModule,
} from 'expo-audio';
import { Platform } from 'react-native';
import type { RecordingStatus } from 'expo-audio';

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  hasPermission: boolean | null;
  audioLevel: number;
  duration: number;
  error: string | null;
}

export function useRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const meteringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef(0);
  const recordingActiveRef = useRef(false);
  const engineRef = useRef<'expo' | 'fallback' | null>(null);
  const startEpochMsRef = useRef<number | null>(null);
  const elapsedMsRef = useRef(0);

  const handleStatusUpdate = useCallback((status: RecordingStatus) => {
    if (status.isFinished && status.url) {
      recordingActiveRef.current = false;
    }
  }, []);

  const recorder = useAudioRecorder(
    {
      ...RecordingPresets.HIGH_QUALITY,
      isMeteringEnabled: true,
    },
    handleStatusUpdate
  );

  const stopMetering = useCallback(() => {
    if (meteringIntervalRef.current) {
      clearInterval(meteringIntervalRef.current);
      meteringIntervalRef.current = null;
    }
  }, []);

  const getElapsedSecondsNow = useCallback((): number => {
    const elapsedMs =
      startEpochMsRef.current !== null
        ? Date.now() - startEpochMsRef.current
        : elapsedMsRef.current;
    return Math.max(0, Math.floor(elapsedMs / 1000));
  }, []);

  useEffect(() => {
    return () => {
      stopMetering();
      if (recordingActiveRef.current) {
        if (engineRef.current === 'expo') {
          try { void recorder.stop(); } catch {}
        }
        recordingActiveRef.current = false;
      }
    };
  }, [recorder, stopMetering]);

  const requestPermission = useCallback(async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      setHasPermission(granted);
      if (!granted) {
        setError('Microphone permission is required.');
      } else {
        setError(null);
      }
      return granted;
    } catch {
      setHasPermission(false);
      setError('Microphone permission is required.');
      return false;
    }
  }, []);

  const startMetering = useCallback(() => {
    stopMetering();
    meteringIntervalRef.current = setInterval(() => {
      if (!recordingActiveRef.current) return;

      const secsFromClock = getElapsedSecondsNow();
      if (secsFromClock >= durationRef.current) {
        durationRef.current = secsFromClock;
        setDuration(secsFromClock);
      }

      try {
        const state = recorder.getStatus();
        if (state.isRecording && state.metering !== undefined) {
          const db = state.metering;
          const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
          setAudioLevel(normalized);
        }
        if (state.isRecording) {
          const secsFromStatus = Math.floor(state.durationMillis / 1000);
          const secs = Math.max(secsFromStatus, secsFromClock);
          if (secs >= durationRef.current) {
            durationRef.current = secs;
            setDuration(secs);
          }
        }
      } catch {
        // Ignore recorder status errors; clock-based duration still updates.
      }
    }, 100);
  }, [getElapsedSecondsNow, recorder, stopMetering]);

  const start = useCallback(async () => {
    let permitted = hasPermission;
    if (permitted === null || permitted === false) {
      permitted = await requestPermission();
    }
    if (!permitted) return false;

    try {
      await AudioModule.setAudioModeAsync({
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();

      engineRef.current = 'expo';
      recordingActiveRef.current = true;
      elapsedMsRef.current = 0;
      startEpochMsRef.current = Date.now();
      durationRef.current = 0;
      setDuration(0);
      setIsRecording(true);
      setIsPaused(false);
      setError(null);
      startMetering();
      return true;
    } catch (err) {
      console.error('Failed to start recording:', err);
      if (Platform.OS === 'web') {
        // Web fallback: allow transcript-only practice (SpeechRecognition) + timer even when
        // the audio recorder is unavailable.
        engineRef.current = 'fallback';
        recordingActiveRef.current = true;
        elapsedMsRef.current = 0;
        startEpochMsRef.current = Date.now();
        durationRef.current = 0;
        setDuration(0);
        setAudioLevel(0);
        setIsRecording(true);
        setIsPaused(false);
        setError('Recording unavailable. Live transcript only.');
        startMetering();
        return true;
      }
      setError('Recording failed to start. Check microphone access.');
      return false;
    }
  }, [hasPermission, requestPermission, startMetering, recorder]);

  const pause = useCallback(async () => {
    if (!recordingActiveRef.current) return;
    try {
      if (startEpochMsRef.current !== null) {
        elapsedMsRef.current = Date.now() - startEpochMsRef.current;
        startEpochMsRef.current = null;
      }

      if (engineRef.current === 'expo' && Platform.OS !== 'web') {
        recorder.pause();
      }
      setIsPaused(true);
      stopMetering();
      setAudioLevel(0);
    } catch (err) {
      console.error('Failed to pause recording:', err);
      setError('Recording pause failed.');
    }
  }, [stopMetering, recorder]);

  const resume = useCallback(async () => {
    if (!recordingActiveRef.current) return;
    try {
      if (startEpochMsRef.current === null) {
        startEpochMsRef.current = Date.now() - elapsedMsRef.current;
      }

      if (engineRef.current === 'expo' && Platform.OS !== 'web') {
        recorder.record();
      }
      setIsPaused(false);
      startMetering();
    } catch (err) {
      console.error('Failed to resume recording:', err);
      setError('Recording resume failed.');
    }
  }, [startMetering, recorder]);

  const stop = useCallback(async (): Promise<{ uri: string | null; durationSeconds: number }> => {
    stopMetering();
    setAudioLevel(0);
    const elapsed = Math.max(durationRef.current, getElapsedSecondsNow());

    if (!recordingActiveRef.current) {
      setIsRecording(false);
      setIsPaused(false);
      return { uri: null, durationSeconds: elapsed };
    }

    try {
      let uri: string | null = null;
      if (engineRef.current === 'expo') {
        await recorder.stop();
        const state = recorder.getStatus();
        uri = state.url || null;
      }
      recordingActiveRef.current = false;
      setIsRecording(false);
      setIsPaused(false);
      engineRef.current = null;
      startEpochMsRef.current = null;
      elapsedMsRef.current = 0;
      durationRef.current = 0;
      setDuration(0);

      await AudioModule.setAudioModeAsync({
        playsInSilentMode: true,
      });

      return { uri, durationSeconds: elapsed };
    } catch (err) {
      console.error('Failed to stop recording:', err);
      setError('Recording stop failed.');
      recordingActiveRef.current = false;
      setIsRecording(false);
      setIsPaused(false);
      engineRef.current = null;
      startEpochMsRef.current = null;
      elapsedMsRef.current = 0;
      return { uri: null, durationSeconds: elapsed };
    }
  }, [getElapsedSecondsNow, stopMetering, recorder]);

  const togglePause = useCallback(async () => {
    if (isPaused) {
      await resume();
    } else {
      await pause();
    }
  }, [isPaused, pause, resume]);

  return {
    isRecording,
    isPaused,
    hasPermission,
    audioLevel,
    duration,
    durationRef,
    error,
    start,
    stop,
    pause,
    resume,
    togglePause,
    requestPermission,
  };
}
