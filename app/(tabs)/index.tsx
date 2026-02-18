import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, Pressable, Platform, Image, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { AudioModule, useAudioPlayer } from 'expo-audio';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { getGenreProfile, getGenreCoachHints, getWordTipForGenre, getGenreFixReasons } from '@/constants/genres';
import RecordButton from '@/components/RecordButton';
import CoachPill from '@/components/CoachPill';
import QualityPill from '@/components/QualityPill';
import LiveLyricsCanvas from '@/components/LiveLyricsCanvas';
import VUMeter from '@/components/VUMeter';
import SongPickerModal from '@/components/SongPickerModal';
import LogoHeader from '@/components/LogoHeader';
import Toast from '@/components/Toast';
import { useApp } from '@/lib/AppContext';
import { buildLiveLyricLines, getLiveLyricProgress } from '@/lib/live-lyrics';
import * as Storage from '@/lib/storage';
import { resolveSpeechRecognitionLang, resolveSttLanguageCode } from '@/lib/language';
import { useRecording } from '@/lib/useRecording';
import { analyzeSessionRecording, fetchWhisperStatus } from '@/lib/session-scoring-client';
import { ingestSessionLearningEvent } from '@/lib/learning-client';
import { buildSessionScoring } from '@shared/session-scoring';
import type { LyricLine, SignalQuality, Session } from '@/lib/types';
import { scaledIconSize, tierValue, useResponsiveLayout } from '@/lib/responsive';

function AnimatedTransportIcon({
  source,
  size,
  active,
  dimmed,
}: {
  source: ImageSourcePropType;
  size: number;
  active: boolean;
  dimmed?: boolean;
}) {
  const pulse = useSharedValue(0);
  const activeProgress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    activeProgress.value = withTiming(active ? 1 : 0, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    });
    if (active) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 980, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 980, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      );
    } else {
      pulse.value = withTiming(0, { duration: 180 });
    }
  }, [active, activeProgress, pulse]);

  const wrapStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(pulse.value, [0, 1], [0, -2]) },
      { scale: interpolate(activeProgress.value, [0, 1], [1, 1.05]) },
    ],
    opacity: dimmed ? 0.5 : 1,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity:
      interpolate(activeProgress.value, [0, 1], [0, 0.66]) *
      interpolate(pulse.value, [0, 1], [0.55, 1]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.9, 1.08]) }],
  }));

  const iconSize = Math.max(20, Math.round(size * 0.86));
  const iconRadius = Math.round(iconSize * 0.24);
  const glowSize = Math.max(16, Math.round(size * 0.72));
  const glowRadius = Math.round(glowSize * 0.38);

  return (
    <Animated.View style={[styles.transportIconShell, { width: size, height: size }, wrapStyle]}>
      <Animated.View
        style={[
          styles.transportIconGlow,
          {
            width: glowSize,
            height: glowSize,
            borderRadius: glowRadius,
          },
          glowStyle,
        ]}
      />
      <Image
        source={source}
        style={[
          styles.transportIconImage,
          {
            width: iconSize,
            height: iconSize,
            borderRadius: iconRadius,
          },
        ]}
        resizeMode="contain"
        accessible={false}
      />
    </Animated.View>
  );
}

export default function SingScreen() {
  const insets = useSafeAreaInsets();
  const responsive = useResponsiveLayout();
  const { activeSong, songs, setActiveSong, addSession, settings, updateSettings } = useApp();
  const recording = useRecording();
  const metronomePlayer = useAudioPlayer(require('@/assets/sounds/metronome-click.wav'));
  const [quality, setQuality] = useState<SignalQuality>('good');
  const [coachHint, setCoachHint] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('Ready to sing');
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; message: string }>(
    { visible: false, message: '' }
  );
  const lastToastErrorRef = useRef<string | null>(null);
  const [countInRemaining, setCountInRemaining] = useState<number | null>(null);
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [liveTrackingSupported, setLiveTrackingSupported] = useState(false);
  const coachTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelCountInRef = useRef(false);
  const coachHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coachHintIndexRef = useRef(0);
  const liveRecognizerRef = useRef<any>(null);
  const liveRecognizerActiveRef = useRef(false);
  const liveRecognizerRestartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metronomeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const metronomeBeatMsRef = useRef<number | null>(null);
  const metronomeBeatRef = useRef(0);

  const isRecording = recording.isRecording;
  const isPaused = recording.isPaused;
  const duration = recording.duration;

  const lyricsText = activeSong?.lyrics || '';
  const lyricsLines = useMemo(
    () => lyricsText.split('\n').filter(l => l.trim()),
    [lyricsText]
  );
  const bpm = activeSong?.bpm;
  const bpmValue =
    typeof bpm === 'number' && Number.isFinite(bpm)
      ? Math.max(30, Math.min(300, Math.round(bpm)))
      : null;
  const beatMs = bpmValue ? Math.round(60000 / bpmValue) : 700;
  const genre = activeSong?.genre || 'pop';
  const genreProfile = useMemo(() => getGenreProfile(genre), [genre]);
  const genreHints = useMemo(() => getGenreCoachHints(genre), [genre]);

  const feedbackThresholds = useMemo(() => {
    const baseConfirmed =
      settings.feedbackIntensity === 'high'
        ? 0.42
        : settings.feedbackIntensity === 'low'
          ? 0.28
          : 0.35;
    const baseUnclear =
      settings.feedbackIntensity === 'high'
        ? 0.2
        : settings.feedbackIntensity === 'low'
          ? 0.09
          : 0.12;
    const modeDelta = settings.liveMode === 'stability' ? 0.03 : -0.03;

    return {
      confirmed: Math.min(0.65, Math.max(0.2, baseConfirmed + modeDelta)),
      unclear: Math.min(0.45, Math.max(0.04, baseUnclear + modeDelta / 2)),
    };
  }, [settings.feedbackIntensity, settings.liveMode]);

  const coachIntervalMs =
    settings.feedbackIntensity === 'high'
      ? 2500
      : settings.feedbackIntensity === 'low'
        ? 6500
        : 4000;

  const liveProgress = useMemo(
    () =>
      getLiveLyricProgress(
        lyricsText,
        liveTranscript,
        settings.liveMode,
        settings.lyricsFollowSpeed
      ),
    [lyricsText, liveTranscript, settings.liveMode, settings.lyricsFollowSpeed]
  );
  const activeLineIndex = liveProgress.activeLineIndex;
  const activeWordIndex = liveProgress.activeWordIndex;

  const stopMetronome = useCallback(() => {
    if (metronomeIntervalRef.current) {
      clearInterval(metronomeIntervalRef.current);
      metronomeIntervalRef.current = null;
    }
    metronomeBeatMsRef.current = null;
    metronomeBeatRef.current = 0;
  }, []);

  const playMetronomeTick = useCallback(
    (accent: boolean) => {
      if (Platform.OS !== 'web') {
        void Haptics.selectionAsync();
      }

      try {
        metronomePlayer.volume = accent ? 0.42 : 0.28;
        void metronomePlayer.seekTo(0).catch(() => undefined);
        metronomePlayer.play();
      } catch {
        // Ignore playback errors; haptics still provides a usable metronome.
      }
    },
    [metronomePlayer]
  );

  const startMetronome = useCallback(
    async (options?: { immediate?: boolean }) => {
      stopMetronome();
      if (!bpmValue || isPaused || isAnalyzing) {
        return;
      }

      try {
        await AudioModule.setAudioModeAsync({ playsInSilentMode: true });
      } catch {
        // Ignore audio mode failures; click may still work on many platforms.
      }

      metronomeBeatRef.current = 0;
      const immediate = options?.immediate ?? true;
      if (immediate) {
        metronomeBeatRef.current = 1;
        playMetronomeTick(true);
      }

      metronomeBeatMsRef.current = beatMs;
      metronomeIntervalRef.current = setInterval(() => {
        metronomeBeatRef.current = (metronomeBeatRef.current % 4) + 1;
        playMetronomeTick(metronomeBeatRef.current === 1);
      }, beatMs);
    },
    [
      beatMs,
      bpmValue,
      isAnalyzing,
      isPaused,
      playMetronomeTick,
      stopMetronome,
    ]
  );

  useEffect(() => {
    if (!settings.metronomeEnabled || !bpmValue || isPaused || isAnalyzing) {
      stopMetronome();
      return;
    }

    if (!metronomeIntervalRef.current || metronomeBeatMsRef.current !== beatMs) {
      void startMetronome({ immediate: false });
    }
    return () => stopMetronome();
  }, [beatMs, bpmValue, isAnalyzing, isPaused, settings.metronomeEnabled, startMetronome, stopMetronome]);

  useEffect(() => {
    if (lyricsText) {
      setLines(
        buildLiveLyricLines({
          lyrics: lyricsText,
          activeFlatIndex: liveProgress.activeFlatIndex,
          confirmedIndices: liveProgress.confirmedIndices,
          genre,
        })
      );
    } else {
      setLines([]);
    }
  }, [genre, liveProgress.activeFlatIndex, liveProgress.confirmedIndices, lyricsText]);

  useEffect(() => {
    const webGlobal = globalThis as {
      SpeechRecognition?: new () => any;
      webkitSpeechRecognition?: new () => any;
    };
    const SpeechRecognitionCtor =
      webGlobal.SpeechRecognition || webGlobal.webkitSpeechRecognition;
    setLiveTrackingSupported(Boolean(Platform.OS === 'web' && SpeechRecognitionCtor));
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    const webGlobal = globalThis as {
      SpeechRecognition?: new () => any;
      webkitSpeechRecognition?: new () => any;
    };
    const SpeechRecognitionCtor =
      webGlobal.SpeechRecognition || webGlobal.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      return;
    }

    const shouldTrack = isRecording && !isPaused;
    if (!shouldTrack) {
      if (liveRecognizerRestartRef.current) {
        clearTimeout(liveRecognizerRestartRef.current);
        liveRecognizerRestartRef.current = null;
      }
      if (liveRecognizerRef.current && liveRecognizerActiveRef.current) {
        try {
          liveRecognizerRef.current.stop();
        } catch {
          // Ignore stop errors from browser speech APIs.
        }
      }
      liveRecognizerActiveRef.current = false;
      return;
    }

    const recognizer = liveRecognizerRef.current ?? new SpeechRecognitionCtor();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.lang = resolveSpeechRecognitionLang(settings.language, settings.accentGoal);
    recognizer.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i += 1) {
        const candidate = event.results[i]?.[0]?.transcript;
        if (typeof candidate === 'string') {
          transcript += `${candidate} `;
        }
      }
      setLiveTranscript(transcript.trim());
    };
    recognizer.onerror = () => {
      // Errors are expected in noisy environments and when permissions change.
    };
    recognizer.onend = () => {
      liveRecognizerActiveRef.current = false;
      if (!(isRecording && !isPaused)) {
        return;
      }
      if (liveRecognizerRestartRef.current) {
        clearTimeout(liveRecognizerRestartRef.current);
      }
      liveRecognizerRestartRef.current = setTimeout(() => {
        try {
          recognizer.start();
          liveRecognizerActiveRef.current = true;
        } catch {
          // Ignore restarts blocked by browser speech recognition state.
        }
      }, 200);
    };

    liveRecognizerRef.current = recognizer;
    if (!liveRecognizerActiveRef.current) {
      try {
        recognizer.start();
        liveRecognizerActiveRef.current = true;
      } catch {
        // Ignore start errors when browser speech recognition is busy.
      }
    }

    return () => {
      if (liveRecognizerRestartRef.current) {
        clearTimeout(liveRecognizerRestartRef.current);
        liveRecognizerRestartRef.current = null;
      }
      if (liveRecognizerRef.current && liveRecognizerActiveRef.current) {
        try {
          liveRecognizerRef.current.stop();
        } catch {
          // Ignore stop errors from browser speech APIs.
        }
        liveRecognizerActiveRef.current = false;
      }
    };
  }, [isPaused, isRecording, settings.accentGoal, settings.language]);

  useEffect(() => {
    if (isRecording && !isPaused) {
      coachTimerRef.current = setInterval(() => {
        const currentLine = lyricsLines[activeLineIndex] || '';
        const words = currentLine.split(' ').filter(w => w.trim());
        const currentWord = words[activeWordIndex] || '';
        const wordTip = currentWord ? getWordTipForGenre(currentWord, genre) : null;
        const fallbackHint =
          genreHints.length > 0
            ? genreHints[coachHintIndexRef.current % genreHints.length]
            : 'Keep airflow steady and diction clear';
        coachHintIndexRef.current += 1;
        const baseHint = wordTip || fallbackHint;
        const hint =
          settings.feedbackIntensity === 'high'
            ? `Focus: ${baseHint}`
            : settings.feedbackIntensity === 'low'
              ? baseHint.replace('! ', '')
              : baseHint;
        setCoachHint(hint);
        if (coachHintTimeoutRef.current) {
          clearTimeout(coachHintTimeoutRef.current);
        }
        coachHintTimeoutRef.current = setTimeout(() => setCoachHint(null), 2500);
      }, coachIntervalMs);
    } else {
      if (coachTimerRef.current) clearInterval(coachTimerRef.current);
      if (coachHintTimeoutRef.current) {
        clearTimeout(coachHintTimeoutRef.current);
        coachHintTimeoutRef.current = null;
      }
      setCoachHint(null);
    }
    return () => {
      if (coachTimerRef.current) clearInterval(coachTimerRef.current);
      if (coachHintTimeoutRef.current) {
        clearTimeout(coachHintTimeoutRef.current);
        coachHintTimeoutRef.current = null;
      }
    };
  }, [
    isRecording,
    isPaused,
    genreHints,
    genre,
    activeLineIndex,
    activeWordIndex,
    lyricsLines,
    coachIntervalMs,
    settings.feedbackIntensity,
  ]);

  useEffect(() => {
    if (recording.error) {
      setStatusText(recording.error);
    } else if (countInRemaining !== null) {
      setStatusText(`Starting in ${countInRemaining}...`);
    } else if (isAnalyzing) {
      setStatusText(analysisStatus ?? 'Analyzing take...');
    } else if (isRecording && !isPaused) {
      setStatusText(
        liveTrackingSupported ? 'Listening with live word tracking...' : 'Listening...'
      );
    } else if (isPaused) {
      setStatusText('Paused');
    } else {
      setStatusText('Ready to sing');
    }
  }, [analysisStatus, countInRemaining, isAnalyzing, isPaused, isRecording, liveTrackingSupported, recording.error]);

  useEffect(() => {
    if (!recording.error) return;
    if (recording.error === lastToastErrorRef.current) return;
    lastToastErrorRef.current = recording.error;
    setToast({ visible: true, message: recording.error });
  }, [recording.error]);

  useEffect(() => {
    if (isRecording && !isPaused) {
      const level = recording.audioLevel;
      if (level > feedbackThresholds.confirmed) {
        setQuality('good');
      } else if (level > feedbackThresholds.unclear) {
        setQuality('ok');
      } else {
        setQuality('poor');
      }
    }
  }, [isRecording, isPaused, recording.audioLevel, feedbackThresholds]);

  const handleStop = useCallback(async () => {
    const result = await recording.stop();
    if (liveRecognizerRestartRef.current) {
      clearTimeout(liveRecognizerRestartRef.current);
      liveRecognizerRestartRef.current = null;
    }
    if (liveRecognizerRef.current && liveRecognizerActiveRef.current) {
      try {
        liveRecognizerRef.current.stop();
      } catch {
        // Ignore stop errors from browser speech APIs.
      }
      liveRecognizerActiveRef.current = false;
    }

    const elapsed = result.durationSeconds;
    // `useRecording` tracks duration in whole seconds, so `> 3` effectively
    // requires 4+ seconds. Treat 3 seconds as the minimum valid take length.
    if (elapsed >= 3) {
      try {
        setIsAnalyzing(true);
        setAnalysisStatus(null);
        const whisperStatus = await fetchWhisperStatus();
        if (whisperStatus?.state === 'loading' || whisperStatus?.state === 'idle') {
          setAnalysisStatus('Preparing speech model...');
        } else if (whisperStatus?.state === 'error') {
          setAnalysisStatus('Speech model unavailable. Using fallback.');
        }
        const recordingUri = result.uri;
        let resolvedInsights: Session['insights'] | null = null;
        let resolvedTranscript = liveTranscript.trim();

        if (recordingUri) {
          const scored = await analyzeSessionRecording({
            recordingUri,
            lyrics: lyricsText,
            durationSeconds: elapsed,
            language: resolveSttLanguageCode(settings.language),
            accentGoal: settings.accentGoal,
          });
          if (scored?.insights) {
            resolvedInsights = {
              textAccuracy: Math.max(0, Math.min(100, scored.insights.textAccuracy)),
              pronunciationClarity: Math.max(
                0,
                Math.min(100, scored.insights.pronunciationClarity)
              ),
              timingConsistency: scored.insights.timingConsistency,
              topToFix: scored.insights.topToFix?.slice(0, 5) || [],
            };
            resolvedTranscript = scored.transcript?.trim() || resolvedTranscript;
          }
        }

        if (!resolvedInsights && liveTranscript.trim()) {
          const localScore = buildSessionScoring({
            expectedLyrics: lyricsText,
            transcript: liveTranscript,
            durationSeconds: elapsed,
          });
          resolvedInsights = {
            textAccuracy: localScore.insights.textAccuracy,
            pronunciationClarity: localScore.insights.pronunciationClarity,
            timingConsistency: localScore.insights.timingConsistency,
            topToFix: localScore.insights.topToFix.slice(0, 5),
          };
          resolvedTranscript = localScore.transcript.trim();
        }

        if (!resolvedInsights) {
          const genreFixes = getGenreFixReasons(genre).slice(0, 3);
          resolvedInsights = {
            textAccuracy: 0,
            pronunciationClarity: 0,
            timingConsistency: 'low',
            topToFix:
              genreFixes.length > 0
                ? genreFixes
                : [{ word: 'analysis', reason: 'Scoring unavailable. Check API connectivity.' }],
          };
        }

        const session: Session = {
          id: Storage.generateId(),
          songId: activeSong?.id,
          genre,
          title: `${activeSong?.title || 'Recording'} - Take`,
          duration: elapsed,
          date: Date.now(),
          tags: ['practice', genreProfile.label.toLowerCase()],
          favorite: false,
          insights: resolvedInsights,
          lyrics: lyricsText,
          transcript: resolvedTranscript || undefined,
        };
        addSession(session);
        // Persist immediately so a hard navigation doesn't drop the new session.
        await Storage.saveSession(session);
        void ingestSessionLearningEvent({ session });
        router.push({ pathname: '/session/[id]', params: { id: session.id, fromRecording: '1' } });
      } finally {
        setIsAnalyzing(false);
        setAnalysisStatus(null);
      }
    }

    setLiveTranscript('');
    setCountInRemaining(null);
  }, [
    activeSong,
    addSession,
    genre,
    genreProfile.label,
    liveTranscript,
    lyricsText,
    recording,
    settings.accentGoal,
    settings.language,
  ]);

  const handleRecordPress = async () => {
    if (isAnalyzing) {
      return;
    }

    if (countInRemaining !== null) {
      cancelCountInRef.current = true;
      setCountInRemaining(null);
      return;
    }

    if (!isRecording) {
      setLiveTranscript('');
      coachHintIndexRef.current = 0;

      if (settings.metronomeEnabled && bpmValue) {
        await startMetronome({ immediate: true });
      }

      if (settings.countIn > 0) {
        cancelCountInRef.current = false;
        for (let beat = settings.countIn; beat > 0; beat -= 1) {
          setCountInRemaining(beat);
          if (!settings.metronomeEnabled || !bpmValue) {
            Haptics.selectionAsync();
          }
          await new Promise((resolve) => setTimeout(resolve, beatMs));
          if (cancelCountInRef.current) {
            cancelCountInRef.current = false;
            return;
          }
        }
      }

      setCountInRemaining(null);
      const started = await recording.start();
      if (!started) {
        setCountInRemaining(null);
      }
    } else {
      await recording.togglePause();
    }
  };

  const handleMarker = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;
  const horizontalInset = responsive.contentPadding;
  const contentMaxWidth = responsive.contentMaxWidth;
  const sectionWrapStyle = useMemo(
    () => ({ width: '100%' as const, maxWidth: contentMaxWidth, alignSelf: 'center' as const }),
    [contentMaxWidth]
  );
  const quickActionSize = tierValue(responsive.tier, [56, 60, 64, 72, 86, 104, 124]);
  const warmupIconSize = tierValue(responsive.tier, [24, 26, 28, 32, 38, 46, 56]);
  const transportImageSize = tierValue(responsive.tier, [34, 38, 42, 50, 62, 76, 92]);
  const transportButtonSize = tierValue(responsive.tier, [50, 54, 58, 66, 78, 94, 112]);
  const noSongLogoSize = tierValue(responsive.tier, [110, 124, 146, 170, 210, 252, 300]);
  const noSongStateIconSize = tierValue(responsive.tier, [120, 140, 164, 196, 240, 290, 340]);
  const recordButtonSize = tierValue(responsive.tier, [88, 96, 104, 116, 136, 164, 196]);
  const scaledIcon = useMemo(
    () => (size: number) => scaledIconSize(size, responsive),
    [responsive]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <Toast
        visible={toast.visible}
        message={toast.message}
        variant="error"
        onHide={() => setToast((current) => ({ ...current, visible: false }))}
      />
      <LogoHeader />
      <View style={[styles.topBar, sectionWrapStyle, { paddingHorizontal: horizontalInset }]}>
        <View style={styles.songSelectorSlot}>
          {activeSong ? (
            <Pressable
              style={styles.songSelector}
              onPress={() => {
                Haptics.selectionAsync();
                setShowSongPicker(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Choose song"
              accessibilityHint="Opens the song picker"
            >
              <Text style={styles.songTitle} numberOfLines={1} accessibilityRole="header">
                {activeSong.title}
              </Text>
              <Ionicons name="chevron-down" size={scaledIcon(12)} color={Colors.textTertiary} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.topRight}>
          {activeSong && (
            <View style={[styles.genreBadge, { backgroundColor: genreProfile.accentColor, borderColor: genreProfile.color }]}>
              <Ionicons name={genreProfile.icon} size={scaledIcon(9)} color={genreProfile.color} />
              <Text style={[styles.genreBadgeText, { color: genreProfile.color }]}>{genreProfile.label}</Text>
            </View>
          )}
          <QualityPill quality={quality} />
        </View>
      </View>

      {activeSong && !isRecording && (
        <View
          style={[
            styles.preRecordRow,
            sectionWrapStyle,
            { marginHorizontal: horizontalInset },
          ]}
        >
          <View style={styles.genreTipBar}>
            <Ionicons name="bulb-outline" size={scaledIcon(10)} color={genreProfile.color} />
            <Text style={styles.genreTipText} numberOfLines={1}>
              {genreProfile.vocalStyle}
            </Text>
          </View>
          <Pressable
            style={styles.warmUpBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push('/warmup');
            }}
            accessibilityRole="button"
            accessibilityLabel="Open warm up"
            accessibilityHint="Starts the vocal warm-up routine"
          >
            <Image
              source={require('@/assets/images/warmup-icon.png')}
              style={[styles.warmUpIcon, { width: warmupIconSize, height: warmupIconSize }]}
              accessible={false}
            />
            <Text style={styles.warmUpBtnText}>Warm Up</Text>
          </Pressable>
          <Pressable
            style={[
              styles.mindfulBtn,
              {
                width: quickActionSize,
                height: quickActionSize,
                borderRadius: Math.round(quickActionSize * 0.24),
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push('/mindfulness');
            }}
            accessibilityRole="button"
            accessibilityLabel="Open mindfulness"
            accessibilityHint="Starts the breathing and focus routine"
          >
            <Image
              source={require('@/assets/images/mindfulness-icon.png')}
              style={[
                styles.mindfulIcon,
                {
                  width: quickActionSize,
                  height: quickActionSize,
                  borderRadius: Math.round(quickActionSize * 0.24),
                },
              ]}
              accessible={false}
            />
          </Pressable>
          <Pressable
            style={[
              styles.easePocketBtn,
              {
                width: quickActionSize,
                height: quickActionSize,
                borderRadius: Math.round(quickActionSize * 0.24),
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push('/easepocket');
            }}
            accessibilityRole="button"
            accessibilityLabel="Open EasePocket timing trainer"
            accessibilityHint="Opens the timing trainer modes"
          >
            <Image
              source={require('@/assets/images/EasePocket.png')}
              style={[
                styles.easePocketIcon,
                {
                  width: quickActionSize,
                  height: quickActionSize,
                  borderRadius: Math.round(quickActionSize * 0.24),
                },
              ]}
              accessible={false}
            />
          </Pressable>
        </View>
      )}

      <View
        style={[
          styles.lyricsArea,
          sectionWrapStyle,
          { paddingHorizontal: Math.max(12, horizontalInset - 2), pointerEvents: 'box-none' as const },
        ]}
      >
        <LiveLyricsCanvas lines={lines} activeLineIndex={activeLineIndex} />
      </View>

      <View style={[styles.coachArea, sectionWrapStyle, { paddingHorizontal: Math.max(12, horizontalInset - 2) }]}>
        <CoachPill hint={coachHint} visible={!!coachHint} />
      </View>

      <View
        style={[
          styles.controls,
          sectionWrapStyle,
          {
            paddingHorizontal: horizontalInset,
            paddingBottom: Math.max(insets.bottom, webBottomInset) + 90,
          },
        ]}
      >
        <VUMeter isActive={isRecording && !isPaused} audioLevel={recording.audioLevel} />

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, {
            backgroundColor: isRecording && !isPaused
              ? Colors.successUnderline
              : isPaused
              ? Colors.warningUnderline
              : Colors.textTertiary,
          }]} />
          <Text style={styles.statusText} accessibilityLiveRegion="polite">{statusText}</Text>
          {isRecording && (
            <Text style={styles.timerText}>{formatTime(duration)}</Text>
          )}
        </View>

        <View style={styles.transportRow}>
          <Pressable
            style={({ pressed }) => [
              styles.transportBtn,
              {
                width: transportButtonSize,
                height: transportButtonSize,
                borderRadius: Math.round(transportButtonSize * 0.32),
              },
              pressed && styles.transportBtnPressed,
            ]}
            onPress={handleMarker}
            disabled={!isRecording}
            accessibilityRole="button"
            accessibilityLabel="Add marker"
            accessibilityHint="Adds a marker at the current recording time"
            accessibilityState={{ disabled: !isRecording }}
          >
            <AnimatedTransportIcon
              source={require('@/assets/images/flag_icon.png')}
              size={transportImageSize}
              active={isRecording}
              dimmed={!isRecording}
            />
          </Pressable>

          <RecordButton
            isRecording={isRecording}
            isPaused={isPaused}
            onPress={handleRecordPress}
            size={recordButtonSize}
            iconSource={require('@/assets/images/record_icon.png')}
          />

          {isRecording ? (
            <Pressable
              style={({ pressed }) => [
                styles.transportBtn,
                {
                  width: transportButtonSize,
                  height: transportButtonSize,
                  borderRadius: Math.round(transportButtonSize * 0.32),
                },
                pressed && styles.transportBtnPressed,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                handleStop();
              }}
              testID="stop-button"
              accessibilityRole="button"
              accessibilityLabel="Stop recording"
              accessibilityHint="Stops recording and opens session review"
            >
              <AnimatedTransportIcon
                source={require('@/assets/images/Stop_icon.png')}
                size={transportImageSize}
                active
              />
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.transportBtn,
                {
                  width: transportButtonSize,
                  height: transportButtonSize,
                  borderRadius: Math.round(transportButtonSize * 0.32),
                },
                pressed && styles.transportBtnPressed,
              ]}
              onPress={() => {
                if (!bpmValue) {
                  Haptics.selectionAsync();
                  router.push('/(tabs)/lyrics');
                  return;
                }

                const next = !settings.metronomeEnabled;
                updateSettings({ metronomeEnabled: next });
                Haptics.selectionAsync();
                if (next) {
                  void startMetronome({ immediate: true });
                } else {
                  stopMetronome();
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Metronome"
              accessibilityHint={
                bpmValue
                  ? `Toggles the metronome click at ${bpmValue} BPM`
                  : 'Set a BPM in Lyrics to enable the metronome'
              }
              accessibilityState={{ selected: settings.metronomeEnabled }}
            >
              <AnimatedTransportIcon
                source={require('@/assets/images/metronome_icon.png')}
                size={transportImageSize}
                active={settings.metronomeEnabled}
                dimmed={!settings.metronomeEnabled}
              />
            </Pressable>
          )}
        </View>
      </View>

      {!activeSong && (
        <View style={styles.emptyOverlay}>
          <View
            style={[
              styles.emptyCard,
              { width: '100%' as const, maxWidth: responsive.cardMaxWidth },
            ]}
          >
            <Image
              source={require('@/assets/images/easeverse_logo_App.png')}
              style={[
                styles.emptyStateTopLogo,
                {
                  width: noSongLogoSize,
                  height: noSongLogoSize,
                },
              ]}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel="EaseVerse logo"
            />
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setShowSongPicker(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Choose existing song"
              accessibilityHint="Opens the song picker so you can load a song"
              style={({ pressed }) => [styles.emptyStateIconPressable, pressed && styles.emptyStateIconPressablePressed]}
            >
              <Image
                source={require('@/assets/images/nosong_state.png')}
                style={[
                  styles.emptyStateIcon,
                  {
                    width: noSongStateIconSize,
                    height: noSongStateIconSize,
                  },
                ]}
                resizeMode="contain"
                accessibilityRole="image"
                accessibilityLabel="No song loaded"
              />
            </Pressable>
            <Text style={styles.emptyTitle}>No lyrics loaded</Text>
            <Text style={styles.emptySubtitle}>
              Choose an existing song or add new lyrics before you start.
            </Text>
            <View style={styles.emptyQuickRow}>
              <Pressable
                style={({ pressed }) => [styles.emptyQuickBtn, pressed && styles.emptyQuickBtnPressed]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push('/warmup');
                }}
                accessibilityRole="button"
                accessibilityLabel="Warm up"
                accessibilityHint="Opens the vocal warm-up routine"
              >
                <Image
                  source={require('@/assets/images/warmup-icon.png')}
                  style={styles.emptyQuickIcon}
                  accessible={false}
                />
                <Text style={styles.emptyQuickText}>Warm Up</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.emptyQuickBtn, pressed && styles.emptyQuickBtnPressed]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push('/mindfulness');
                }}
                accessibilityRole="button"
                accessibilityLabel="Mindfulness"
                accessibilityHint="Opens the breathing and focus routine"
              >
                <Image
                  source={require('@/assets/images/mindfulness-icon.png')}
                  style={styles.emptyQuickIcon}
                  accessible={false}
                />
                <Text style={styles.emptyQuickText}>Mindfulness</Text>
              </Pressable>
            </View>
            <Pressable
              style={({ pressed }) => [styles.emptySecondaryBtn, pressed && styles.emptySecondaryBtnPressed]}
              onPress={() => {
                Haptics.selectionAsync();
                setShowSongPicker(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Choose existing song"
              accessibilityHint="Opens the song picker"
            >
              <Ionicons name="musical-notes-outline" size={scaledIcon(11)} color={Colors.textPrimary} />
              <Text style={styles.emptySecondaryBtnText}>Choose Existing Song</Text>
            </Pressable>
            <Pressable
              style={styles.emptyBtn}
              onPress={() => router.push('/(tabs)/lyrics')}
              accessibilityRole="button"
              accessibilityLabel="Add lyrics"
              accessibilityHint="Navigates to the lyrics tab"
            >
              <LinearGradient
                colors={[Colors.gradientStart, Colors.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.emptyBtnGradient}
              >
                <Text style={styles.emptyBtnText}>Add Lyrics</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      )}

      <SongPickerModal
        visible={showSongPicker}
        songs={songs}
        activeSongId={activeSong?.id}
        onSelect={(song) => setActiveSong(song)}
        onClose={() => setShowSongPicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    zIndex: 10,
  },
  songSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
  },
  songSelectorSlot: {
    flex: 1,
    marginRight: 12,
    justifyContent: 'center',
  },
  songTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    maxWidth: '80%',
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  genreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  genreBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  preRecordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
  },
  genreTipBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.surfaceGlass,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  warmUpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: Colors.accentSubtle,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
  },
  warmUpIcon: {
    width: 20,
    height: 20,
  },
  warmUpBtnText: {
    color: Colors.gradientStart,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  mindfulBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: 'hidden',
  },
  mindfulIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  easePocketBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
  },
  easePocketIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    resizeMode: 'cover',
  },
  genreTipText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  lyricsArea: {
    flex: 1,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  coachArea: {
    minHeight: 40,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  controls: {
    paddingHorizontal: 20,
    gap: 10,
    zIndex: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    color: Colors.textTertiary,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  timerText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    marginLeft: 4,
  },
  transportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  transportBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  transportBtnPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.92,
  },
  transportIconShell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  transportIconGlow: {
    position: 'absolute',
    backgroundColor: Colors.accentGlow,
  },
  transportIconImage: {
    maxWidth: '100%' as const,
    maxHeight: '100%' as const,
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14,15,20,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyCard: {
    alignItems: 'center',
    gap: 16,
  },
  emptyStateTopLogo: {
    marginBottom: -6,
  },
  emptyStateIcon: {
    marginBottom: -4,
  },
  emptyStateIconPressable: {
    borderRadius: 20,
    padding: 6,
  },
  emptyStateIconPressablePressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  emptyTitle: {
    color: Colors.textSecondary,
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
  },
  emptySubtitle: {
    color: Colors.textTertiary,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    maxWidth: 360,
    marginTop: -8,
  },
  emptyQuickRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    maxWidth: 420,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  emptyQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    minHeight: 44,
  },
  emptyQuickBtnPressed: {
    opacity: 0.9,
  },
  emptyQuickIcon: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
  },
  emptyQuickText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  emptySecondaryBtn: {
    width: '100%',
    maxWidth: 420,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: -4,
  },
  emptySecondaryBtnPressed: {
    opacity: 0.9,
  },
  emptySecondaryBtnText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  emptyBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  emptyBtnGradient: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  emptyBtnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
});
