import { useRef, useState, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';

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

  const recordingRef = useRef<Audio.Recording | null>(null);
  const meteringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef(0);

  useEffect(() => {
    return () => {
      stopMetering();
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
    };
  }, []);

  const requestPermission = useCallback(async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      setHasPermission(granted);
      return granted;
    } catch {
      setHasPermission(false);
      return false;
    }
  }, []);

  const startMetering = useCallback(() => {
    stopMetering();
    meteringIntervalRef.current = setInterval(async () => {
      if (!recordingRef.current) return;
      try {
        const status = await recordingRef.current.getStatusAsync();
        if (status.isRecording && status.metering !== undefined) {
          const db = status.metering;
          const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
          setAudioLevel(normalized);
        }
        if (status.isRecording) {
          const secs = Math.floor(status.durationMillis / 1000);
          durationRef.current = secs;
          setDuration(secs);
        }
      } catch {}
    }, 100);
  }, []);

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
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      await recording.startAsync();

      recordingRef.current = recording;
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
  }, [hasPermission, requestPermission, startMetering]);

  const pause = useCallback(async () => {
    if (!recordingRef.current) return;
    try {
      if (Platform.OS !== 'web') {
        await recordingRef.current.pauseAsync();
      }
      setIsPaused(true);
      stopMetering();
      setAudioLevel(0);
    } catch (err) {
      console.error('Failed to pause recording:', err);
    }
  }, [stopMetering]);

  const resume = useCallback(async () => {
    if (!recordingRef.current) return;
    try {
      if (Platform.OS !== 'web') {
        await recordingRef.current.startAsync();
      }
      setIsPaused(false);
      startMetering();
    } catch (err) {
      console.error('Failed to resume recording:', err);
    }
  }, [startMetering]);

  const stop = useCallback(async (): Promise<{ uri: string | null; durationSeconds: number }> => {
    stopMetering();
    setAudioLevel(0);
    const elapsed = durationRef.current;

    if (!recordingRef.current) {
      setIsRecording(false);
      setIsPaused(false);
      return { uri: null, durationSeconds: elapsed };
    }

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setIsRecording(false);
      setIsPaused(false);
      durationRef.current = 0;
      setDuration(0);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      return { uri: uri || null, durationSeconds: elapsed };
    } catch (err) {
      console.error('Failed to stop recording:', err);
      recordingRef.current = null;
      setIsRecording(false);
      setIsPaused(false);
      return { uri: null, durationSeconds: elapsed };
    }
  }, [stopMetering]);

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
