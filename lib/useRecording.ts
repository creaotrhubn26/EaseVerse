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
}

export function useRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [duration, setDuration] = useState(0);

  const meteringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef(0);
  const recordingActiveRef = useRef(false);

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

  useEffect(() => {
    return () => {
      stopMetering();
      if (recordingActiveRef.current) {
        try { recorder.stop(); } catch {}
        recordingActiveRef.current = false;
      }
    };
  }, []);

  const requestPermission = useCallback(async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      setHasPermission(granted);
      return granted;
    } catch {
      setHasPermission(false);
      return false;
    }
  }, []);

  const startMetering = useCallback(() => {
    stopMetering();
    meteringIntervalRef.current = setInterval(() => {
      if (!recordingActiveRef.current) return;
      try {
        const state = recorder.getStatus();
        if (state.isRecording && state.metering !== undefined) {
          const db = state.metering;
          const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
          setAudioLevel(normalized);
        }
        if (state.isRecording) {
          const secs = Math.floor(state.durationMillis / 1000);
          durationRef.current = secs;
          setDuration(secs);
        }
      } catch {}
    }, 100);
  }, [recorder]);

  const stopMetering = useCallback(() => {
    if (meteringIntervalRef.current) {
      clearInterval(meteringIntervalRef.current);
      meteringIntervalRef.current = null;
    }
  }, []);

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

      recordingActiveRef.current = true;
      durationRef.current = 0;
      setDuration(0);
      setIsRecording(true);
      setIsPaused(false);
      startMetering();
      return true;
    } catch (err) {
      console.error('Failed to start recording:', err);
      return false;
    }
  }, [hasPermission, requestPermission, startMetering, recorder]);

  const pause = useCallback(async () => {
    if (!recordingActiveRef.current) return;
    try {
      if (Platform.OS !== 'web') {
        recorder.pause();
      }
      setIsPaused(true);
      stopMetering();
      setAudioLevel(0);
    } catch (err) {
      console.error('Failed to pause recording:', err);
    }
  }, [stopMetering, recorder]);

  const resume = useCallback(async () => {
    if (!recordingActiveRef.current) return;
    try {
      if (Platform.OS !== 'web') {
        recorder.record();
      }
      setIsPaused(false);
      startMetering();
    } catch (err) {
      console.error('Failed to resume recording:', err);
    }
  }, [startMetering, recorder]);

  const stop = useCallback(async (): Promise<{ uri: string | null; durationSeconds: number }> => {
    stopMetering();
    setAudioLevel(0);
    const elapsed = durationRef.current;

    if (!recordingActiveRef.current) {
      setIsRecording(false);
      setIsPaused(false);
      return { uri: null, durationSeconds: elapsed };
    }

    try {
      recorder.stop();
      const state = recorder.getStatus();
      const uri = state.url;
      recordingActiveRef.current = false;
      setIsRecording(false);
      setIsPaused(false);
      durationRef.current = 0;
      setDuration(0);

      await AudioModule.setAudioModeAsync({
        playsInSilentMode: true,
      });

      return { uri: uri || null, durationSeconds: elapsed };
    } catch (err) {
      console.error('Failed to stop recording:', err);
      recordingActiveRef.current = false;
      setIsRecording(false);
      setIsPaused(false);
      return { uri: null, durationSeconds: elapsed };
    }
  }, [stopMetering, recorder]);

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
    start,
    stop,
    pause,
    resume,
    togglePause,
    requestPermission,
  };
}
