import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, Pressable, Platform, Image, ScrollView, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { AudioModule, useAudioPlayer } from 'expo-audio';
import { useAssets } from 'expo-asset';
import Colors from '@/constants/colors';
import { getGenreProfile, getGenreCoachHints, getWordTipForGenre, getGenreFixReasons } from '@/constants/genres';
import RecordButton from '@/components/RecordButton';
import CoachPill from '@/components/CoachPill';
import QualityPill from '@/components/QualityPill';
import LiveLyricsCanvas from '@/components/LiveLyricsCanvas';
import VUMeter from '@/components/VUMeter';
import SongPickerModal from '@/components/SongPickerModal';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { SingStartScreen } from '@/components/SingStartScreen';
import Toast from '@/components/Toast';
import { MicPermissionRationale } from '@/components/MicPermissionRationale';
import { OnboardingChecklist, type ChecklistStep } from '@/components/OnboardingChecklist';
import { InlineLyricsEditor } from '@/components/InlineLyricsEditor';
import { PostureReminder } from '@/components/PostureReminder';
import { AUTH_CONFIGURED } from '@/lib/use-app-user';
import { WhatsNewBanner } from '@/components/WhatsNewBanner';
import { StudioOnboardingChecklist } from '@/components/StudioOnboardingChecklist';
import { PitchOverlay } from '@/components/PitchOverlay';
import { usePitchDetection } from '@/lib/usePitchDetection';
import { useVibratoDetection } from '@/lib/useVibratoDetection';
import { useApp } from '@/lib/AppContext';
import { buildLiveLyricLines, getLiveLyricProgress } from '@/lib/live-lyrics';
import * as Storage from '@/lib/storage';
import { resolveSpeechRecognitionLang, resolveSttLanguageCode } from '@/lib/language';
import { useRecording } from '@/lib/useRecording';
import { analyzeSessionRecording, fetchWhisperStatus } from '@/lib/session-scoring-client';
import { ingestSessionLearningEvent } from '@/lib/learning-client';
import { buildSessionScoring } from '@shared/session-scoring';
import type { LyricLine, SignalQuality, Session, Song } from '@/lib/types';
import { useResponsiveLayout } from '@/lib/responsive';

const warmupIconSource =
  Platform.OS === 'web'
    ? require('@/assets/images/web/warmup-icon.web.png')
    : require('@/assets/images/warmup-icon.png');
const mindfulnessIconSource =
  Platform.OS === 'web'
    ? require('@/assets/images/web/mindfulness-icon.web.png')
    : require('@/assets/images/mindfulness-icon.png');
const easePocketIconSource =
  Platform.OS === 'web'
    ? require('@/assets/images/EasePocket.webp')
    : require('@/assets/images/EasePocket.png');
const recordControlIconSource = require('@/assets/images/sing-record-v1.png');
const stopControlIconSource = require('@/assets/images/sing-stop-v1.png');
const metronomeControlIconSource = require('@/assets/images/sing-metronome-v1.png');
const markerControlIconSource = require('@/assets/images/sing-marker-v1.png');

function TransportIcon({ source, size, active, dimmed }: {
  source: ImageSourcePropType; size: number; active: boolean; dimmed?: boolean;
}) {
  return <View style={[styles.transportIconShell, { width: size, height: size, opacity: dimmed ? 0.4 : 1 },
    active && styles.transportIconActive]}>
    <Image source={source} style={{ width: size, height: size }} resizeMode="contain" accessible={false} />
  </View>;
}

export default function SingScreen() {
  useAssets([recordControlIconSource, stopControlIconSource, metronomeControlIconSource, markerControlIconSource]);
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const responsive = useResponsiveLayout();
  const { activeSong, songs, sessions, setActiveSong, addSession, addSong, settings, updateSettings, updateSong } =
    useApp();
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
  const [showMicRationale, setShowMicRationale] = useState(false);
  const [showInlineEditor, setShowInlineEditor] = useState(false);
  const [showPreparation, setShowPreparation] = useState(false);
  const [recoveredDraft, setRecoveredDraft] = useState<Storage.DraftSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const draft = await Storage.getDraftSession();
        if (!cancelled && draft) {
          const ageMs = Date.now() - draft.lastUpdatedAt;
          if (ageMs < 24 * 60 * 60 * 1000 && draft.durationSeconds >= 3) {
            setRecoveredDraft(draft);
          } else {
            await Storage.clearDraftSession();
          }
        }
      } catch {
        // Ignore.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const micRationaleSeenRef = useRef<boolean | null>(null);
  const [onboardingFlags, setOnboardingFlags] = useState<Storage.OnboardingFlags | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const flags = await Storage.getOnboardingFlags();
        if (!cancelled) {
          micRationaleSeenRef.current = flags.micRationaleShown;
          setOnboardingFlags(flags);
        }
      } catch {
        if (!cancelled) {
          micRationaleSeenRef.current = false;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
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
  // True only while the record tab is the visible screen. Tabs stay mounted in
  // expo-router, so without this the metronome kept ticking (and haptic-buzzing)
  // on other tabs whenever a recording was still active in the background.
  const screenFocused = useIsFocused();
  const duration = recording.duration;
  const pitchReading = usePitchDetection(isRecording && !isPaused);
  const vibratoReading = useVibratoDetection(pitchReading);

  useEffect(() => {
    if (!isRecording) return;
    const startedAt = Date.now() - duration * 1000;
    const interval = setInterval(() => {
      void Storage.saveDraftSession({
        songId: activeSong?.id,
        songTitle: activeSong?.title,
        startedAt,
        lastUpdatedAt: Date.now(),
        transcript: liveTranscript,
        lyrics: activeSong?.lyrics ?? '',
        durationSeconds: duration,
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [isRecording, duration, liveTranscript, activeSong]);

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
      // Per-beat haptic is opt-in (settings.metronomeHaptics) — the audible
      // click is always the primary cue. Keeps the metronome from buzzing on
      // every beat unless the user explicitly turns vibration on.
      if (Platform.OS !== 'web' && settings.metronomeHaptics) {
        void Haptics.selectionAsync();
      }

      try {
        metronomePlayer.volume = accent ? 0.42 : 0.28;
        void metronomePlayer.seekTo(0).catch(() => undefined);
        metronomePlayer.play();
      } catch {
        // Ignore playback errors; the click is the primary metronome cue.
      }
    },
    [metronomePlayer, settings.metronomeHaptics]
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
    // Only run the metronome while actively recording. Without the isRecording
    // gate (the sibling pitch/tracking effects all have it) the click + per-beat
    // Haptics.selectionAsync fired continuously just from sitting idle on a song
    // with a BPM and the metronome setting on — a phone buzzing every beat.
    if (!screenFocused || !isRecording || !settings.metronomeEnabled || !bpmValue || isPaused || isAnalyzing) {
      stopMetronome();
      return;
    }

    if (!metronomeIntervalRef.current || metronomeBeatMsRef.current !== beatMs) {
      void startMetronome({ immediate: false });
    }
    return () => stopMetronome();
  }, [beatMs, bpmValue, isAnalyzing, isPaused, isRecording, screenFocused, settings.metronomeEnabled, startMetronome, stopMetronome]);

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
      setStatusText(`Count-in: ${countInRemaining}...`);
    } else if (isAnalyzing) {
      setStatusText(analysisStatus ?? 'Analyzing your take...');
    } else if (isRecording && !isPaused) {
      setStatusText(
        liveTrackingSupported
          ? 'Listening with live word tracking.'
          : 'Listening.'
      );
    } else if (isPaused) {
      setStatusText('Paused. Tap record to resume — or Stop to play it back.');
    } else {
      setStatusText('Ready. Tap record to start your take.');
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

  const recordingRedirectRef = useRef<'session' | 'practice'>('session');

  const handleRestart = useCallback(async () => {
    try {
      await recording.stop();
    } catch {
      // Ignore stop errors while discarding take.
    }
    if (liveRecognizerRestartRef.current) {
      clearTimeout(liveRecognizerRestartRef.current);
      liveRecognizerRestartRef.current = null;
    }
    if (liveRecognizerRef.current && liveRecognizerActiveRef.current) {
      try {
        liveRecognizerRef.current.stop();
      } catch {
        // Ignore.
      }
      liveRecognizerActiveRef.current = false;
    }
    setLiveTranscript('');
    setCoachHint(null);
    coachHintIndexRef.current = 0;
    setStatusText('Restarting take…');
    void Storage.clearDraftSession();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTimeout(() => {
      void handleRecordPress();
    }, 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

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
          recordingUri: recordingUri || undefined,
          tags: ['practice', genreProfile.label.toLowerCase()],
          favorite: false,
          insights: resolvedInsights,
          lyrics: lyricsText,
          transcript: resolvedTranscript || undefined,
        };
        addSession(session);
        // Persist immediately so a hard navigation doesn't drop the new session.
        await Storage.saveSession(session);
        void Storage.clearDraftSession();
        void ingestSessionLearningEvent({ session });
        const dest = recordingRedirectRef.current;
        recordingRedirectRef.current = 'session';
        if (dest === 'practice') {
          router.push({ pathname: '/practice/[id]', params: { id: session.id } });
        } else {
          router.push({ pathname: '/session/[id]', params: { id: session.id, fromRecording: '1' } });
        }
      } finally {
        setIsAnalyzing(false);
        setAnalysisStatus(null);
      }
    } else {
      setToast({
        visible: true,
        message: 'Record at least 3 seconds to generate session feedback.',
      });
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
      const isAutomatedBrowser =
        Platform.OS === 'web' &&
        typeof navigator !== 'undefined' &&
        (navigator as Navigator & { webdriver?: boolean }).webdriver === true;
      if (
        !isAutomatedBrowser &&
        recording.hasPermission !== true &&
        micRationaleSeenRef.current === false
      ) {
        micRationaleSeenRef.current = true;
        void Storage.updateOnboardingFlags({ micRationaleShown: true });
        setShowMicRationale(true);
        return;
      }

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

  const horizontalInset = responsive.contentPadding;
  const contentMaxWidth = responsive.contentMaxWidth;
  const sectionWrapStyle = useMemo(
    () => ({ width: '100%' as const, maxWidth: contentMaxWidth, alignSelf: 'center' as const }),
    [contentMaxWidth]
  );
  // Keep the transport reachable on compact phones; tablet size should not
  // take space away from lyrics. The record button includes a 32px outer ring.
  const activeTransportImageSize = isRecording ? 28 : 34;
  const activeTransportButtonSize = 44;
  const activeRecordButtonSize = isRecording ? 64 : 72;
  const activeTransportGap = isRecording ? 4 : 24;
  const recordingStageLabel = recording.error
    ? 'Issue'
    : countInRemaining !== null
      ? 'Count-In'
      : isAnalyzing
        ? 'Analyzing'
        : isRecording && !isPaused
          ? 'Listening'
          : isPaused
            ? 'Paused'
            : 'Ready';
  const recordingActionHint = recording.error
    ? 'Check microphone settings, then retry.'
    : countInRemaining !== null
      ? 'Tap record to cancel count-in.'
      : isAnalyzing
        ? 'Hold on while feedback is generated.'
        : isRecording && !isPaused
          ? 'Tap stop to open Session Review.'
          : isPaused
            ? 'Tap record to resume. To hear your take, tap Stop — it opens Session Review with playback.'
            : 'Tap record to start a take.';

  const prepareVoiceMemo = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const now = Date.now();
    const memo: Song = {
      id: Storage.generateId(),
      title: `Voice memo · ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      lyrics: '', genre: 'pop', sections: [], createdAt: now, updatedAt: now,
    };
    addSong(memo);
    setActiveSong(memo);
  };
  const personalSetup = onboardingFlags && !onboardingFlags.checklistDismissed ? (
        <OnboardingChecklist
          collapsible
          steps={[
            {
              id: 'language',
              label: `Choose language (${settings.language})`,
              done: onboardingFlags.languageConfirmed,
              onPress: () => {
                void Storage.updateOnboardingFlags({ languageConfirmed: true }).then(
                  setOnboardingFlags,
                );
                router.push('/(tabs)/profile');
              },
            },
            {
              id: 'accent',
              label: `Choose accent goal (${settings.accentGoal})`,
              done: onboardingFlags.accentConfirmed,
              onPress: () => {
                void Storage.updateOnboardingFlags({ accentConfirmed: true }).then(
                  setOnboardingFlags,
                );
                router.push('/(tabs)/profile');
              },
            },
            {
              id: 'firstTake',
              label: 'Record your first take',
              done: sessions.length > 0,
              onPress: !activeSong ? prepareVoiceMemo : undefined,
            },
          ] satisfies ChecklistStep[]}
          onDismiss={() => {
            void Storage.updateOnboardingFlags({ checklistDismissed: true }).then(
              setOnboardingFlags,
            );
          }}
        />
      ) : null;

  if (!activeSong && !isRecording && !isAnalyzing && countInRemaining === null) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <SingStartScreen onCaptureIdea={prepareVoiceMemo} onChooseSong={() => setShowSongPicker(true)}
          onboarding={<>{personalSetup}{AUTH_CONFIGURED ? <StudioOnboardingChecklist /> : null}</>}
          notices={<>{AUTH_CONFIGURED ? <WhatsNewBanner /> : null}{recoveredDraft ? (
            <View style={styles.draftBanner}>
              <Ionicons name="time-outline" size={18} color={Colors.gradientMid} />
              <View style={{flex: 1}}><Text style={styles.draftBannerTitle}>Draft recovered</Text>
                <Text style={styles.draftBannerSubtitle}>Your last take{recoveredDraft.songTitle ? ` of “${recoveredDraft.songTitle}”` : ''} ran about {Math.round(recoveredDraft.durationSeconds)}s.</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Dismiss draft recovery"
                style={{minHeight:44,minWidth:44,alignItems:'center',justifyContent:'center'}}
                onPress={() => {void Storage.clearDraftSession();setRecoveredDraft(null);}}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>
          ) : null}</>}
        />
        <SongPickerModal visible={showSongPicker} songs={songs} onSelect={setActiveSong} onClose={() => setShowSongPicker(false)} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === 'web' ? 12 : 0) }]}>
      <Toast
        visible={toast.visible}
        message={toast.message}
        variant="error"
        onHide={() => setToast((current) => ({ ...current, visible: false }))}
      />
      <View style={[styles.singHeader, sectionWrapStyle, { paddingHorizontal: horizontalInset }]}>
        <Text style={styles.screenTitle}>Sing</Text>
        <View style={styles.brandCrop}>
          <Image source={require('@/assets/images/easeverse_logo.png')} style={styles.brandLogo}
            resizeMode="contain" accessibilityRole="image" accessibilityLabel="EaseVerse" />
        </View>
      </View>
      <ScrollView style={styles.songScroll} contentContainerStyle={styles.songScrollContent}
        testID="sing-content" keyboardShouldPersistTaps="handled">
      {recoveredDraft ? (
        <View style={styles.draftBanner}>
          <Ionicons name="time-outline" size={16} color={Colors.gradientStart} />
          <View style={{ flex: 1 }}>
            <Text style={styles.draftBannerTitle}>Draft recovered</Text>
            <Text style={styles.draftBannerSubtitle}>
              Last take{recoveredDraft.songTitle ? ` of "${recoveredDraft.songTitle}"` : ''} ran ~{Math.round(recoveredDraft.durationSeconds)}s
            </Text>
          </View>
          <Pressable
            onPress={() => {
              void Storage.clearDraftSession();
              setRecoveredDraft(null);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Dismiss draft recovery"
          >
            <Ionicons name="close" size={16} color={Colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}
      <View style={[styles.songHeading, sectionWrapStyle, { paddingHorizontal: horizontalInset }]}>
        {!isRecording && <Text style={styles.eyebrow}>YOUR SONG</Text>}
        <Pressable style={styles.songSelector} onPress={() => setShowSongPicker(true)}
          accessibilityRole="button" accessibilityLabel="Choose song"
          accessibilityHint="Opens the song picker" disabled={isRecording || isAnalyzing}>
          <Text style={[styles.songTitle, isRecording && styles.recordingSongTitle]} accessibilityRole="header">{activeSong?.title ?? 'Vocal idea'}</Text>
          <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
        </Pressable>
        {!isRecording && <View style={styles.songMeta}>
          {activeSong ? <View style={styles.genreBadge}>
            <Ionicons name={genreProfile.icon} size={14} color={Colors.gradientMid} />
            <Text style={styles.genreBadgeText}>{genreProfile.label}</Text>
          </View> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Edit lyrics inline" testID="inline-edit-button"
            disabled={isRecording || isAnalyzing} onPress={() => setShowInlineEditor(true)}
            style={({ pressed }) => [styles.editLyricsBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="create-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.editText}>Edit lyrics</Text>
          </Pressable>
        </View>}
      </View>
      {!isRecording && !isAnalyzing ? <View style={[sectionWrapStyle, { paddingHorizontal: horizontalInset }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Before you sing"
          accessibilityState={{ expanded: showPreparation }}
          {...(Platform.OS === 'web' ? { 'aria-expanded': showPreparation } : {})}
          onPress={() => setShowPreparation(value => !value)}
          style={styles.preparationToggle}>
          <Ionicons name="sparkles-outline" size={20} color={Colors.gradientMid} />
          <View style={styles.preparationCopy}><Text style={styles.preparationTitle}>Before you sing</Text>
            <Text style={styles.preparationHint}>Warm up, focus & practice setup</Text></View>
          <Ionicons name={showPreparation ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textSecondary} />
        </Pressable>
        {showPreparation ? <View style={styles.preparationBody}>
          <View style={styles.quickDockRow}>
            {[
              { title: 'Warm up', label: 'Open warm up', image: warmupIconSource, path: '/warmup' as const },
              { title: 'Find focus', label: 'Open mindfulness', image: mindfulnessIconSource, path: '/mindfulness' as const },
              { title: 'Timing', label: 'Open EasePocket timing trainer', image: easePocketIconSource, path: '/easepocket' as const },
            ].map(action => <Pressable key={action.path} accessibilityRole="button" accessibilityLabel={action.label}
              style={styles.quickDockBtn} onPress={() => router.push(action.path)}>
              <Image source={action.image} style={styles.quickDockIcon} resizeMode="contain" accessible={false} />
              <Text style={styles.shortcutLabel}>{action.title}</Text>
            </Pressable>)}
          </View>
          {personalSetup}
          {AUTH_CONFIGURED ? <StudioOnboardingChecklist /> : null}
          {AUTH_CONFIGURED ? <WhatsNewBanner /> : null}
          {!isRecording && !isAnalyzing && onboardingFlags && !onboardingFlags.postureReminderDismissed && activeSong ? (
            <PostureReminder
              onDismiss={() => {
                void Storage.updateOnboardingFlags({ postureReminderDismissed: true }).then(
                  setOnboardingFlags,
                );
              }}
            />
          ) : null}
          <Text style={styles.preparationHint}>Tap Record when you’re ready. Stop after at least 3 seconds to listen back in Session Review.</Text>
        </View> : null}
      </View> : null}

      <View
        style={[
          styles.lyricsArea,
          sectionWrapStyle,
          { paddingHorizontal: horizontalInset },
        ]}
      >
        <View style={styles.lyricsLabelRow}><Text style={styles.eyebrow}>LYRICS</Text>
          <Text style={styles.preparationHint}>{isRecording ? 'Follow your words' : 'Your next take starts here'}</Text></View>
        <LiveLyricsCanvas lines={lines} activeLineIndex={activeLineIndex} isListening={isRecording} />
      </View>

      {isRecording && !isPaused ? <View style={[sectionWrapStyle, { paddingHorizontal: horizontalInset, paddingTop: 12 }]}><PitchOverlay reading={pitchReading} vibrato={vibratoReading} /></View> : null}
      {!!coachHint && <View style={[styles.coachArea, sectionWrapStyle, { paddingHorizontal: horizontalInset }]}>
        <CoachPill hint={coachHint} visible />
      </View>}
      </ScrollView>
      <View
        style={[
          styles.controls,
          sectionWrapStyle,
          {
            paddingHorizontal: horizontalInset,
            paddingBottom: Platform.OS === 'web' ? 8 : tabBarHeight + 8,
          },
        ]}
      >
        <View style={styles.recordingStatus} testID="sing-recording-status">
          <View style={styles.primaryActionStateRow}>
            <Ionicons name={isRecording && !isPaused ? 'mic' : 'mic-off-outline'} size={16}
              color={isRecording && !isPaused ? Colors.gradientMid : Colors.textSecondary} />
            <Text style={styles.primaryActionStateText} accessibilityLiveRegion="polite">
              {isRecording || isAnalyzing || countInRemaining !== null || recording.error ? recordingStageLabel : 'Mic off'}
            </Text>
          </View>
          {isRecording && !isPaused ? <><VUMeter isActive audioLevel={recording.audioLevel} barCount={10} /><QualityPill quality={quality} /></> : null}
          {(isRecording || isAnalyzing) ? <Text style={styles.primaryActionTimer}>
            {isAnalyzing ? 'Processing…' : formatTime(duration)}</Text> : null}
        </View>
        <Text style={styles.recordingHint} accessibilityLiveRegion="polite">
          {recording.error ? statusText : recordingActionHint}
        </Text>
        <View style={[styles.transportRow, { gap: activeTransportGap }]}>
          <Pressable
            style={({ pressed }) => [
              styles.transportBtn,
              {
                width: activeTransportButtonSize,
                height: activeTransportButtonSize,
                borderRadius: Math.round(activeTransportButtonSize * 0.32),
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
            <TransportIcon
              source={markerControlIconSource}
              size={activeTransportImageSize}
              active={isRecording}
              dimmed={!isRecording}
            />
            <Text style={styles.transportLabel}>Marker</Text>
          </Pressable>

          <RecordButton
            isRecording={isRecording}
            isPaused={isPaused}
            onPress={handleRecordPress}
            size={activeRecordButtonSize}
            iconSource={recordControlIconSource}
          />

          {isRecording ? (
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.transportBtn,
                  {
                    width: activeTransportButtonSize,
                    height: activeTransportButtonSize,
                    borderRadius: Math.round(activeTransportButtonSize * 0.32),
                  },
                  pressed && styles.transportBtnPressed,
                ]}
                onPress={handleRestart}
                testID="restart-button"
                accessibilityRole="button"
                accessibilityLabel="Restart take"
                accessibilityHint="Discards the current take and starts a new one"
              >
                <Ionicons name="refresh" size={22} color={Colors.textPrimary} />
                <Text style={styles.transportLabel}>Restart</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.transportBtn,
                  {
                    width: activeTransportButtonSize,
                    height: activeTransportButtonSize,
                    borderRadius: Math.round(activeTransportButtonSize * 0.32),
                  },
                  pressed && styles.transportBtnPressed,
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  recordingRedirectRef.current = 'practice';
                  void handleStop();
                }}
                testID="practice-from-recording-button"
                accessibilityRole="button"
                accessibilityLabel="Practice this part"
                accessibilityHint="Stops recording and opens practice loop for the new session"
              >
                <Ionicons name="repeat" size={22} color={Colors.textPrimary} />
                <Text style={styles.transportLabel}>Practice</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.transportBtn,
                  {
                    width: activeTransportButtonSize,
                    height: activeTransportButtonSize,
                    borderRadius: Math.round(activeTransportButtonSize * 0.32),
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
                <TransportIcon
                  source={stopControlIconSource}
                  size={activeTransportImageSize}
                  active
                />
                <Text style={styles.transportLabel}>Stop</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.transportBtn,
                {
                  width: activeTransportButtonSize,
                  height: activeTransportButtonSize,
                  borderRadius: Math.round(activeTransportButtonSize * 0.32),
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
              <TransportIcon
                source={metronomeControlIconSource}
                size={activeTransportImageSize}
                active={settings.metronomeEnabled}
                dimmed={false}
              />
              <Text style={styles.transportLabel}>Metronome</Text>
            </Pressable>
          )}
        </View>
      </View>


      <SongPickerModal
        visible={showSongPicker}
        songs={songs}
        activeSongId={activeSong?.id}
        onSelect={(song) => setActiveSong(song)}
        onClose={() => setShowSongPicker(false)}
      />

      {activeSong ? (
        <InlineLyricsEditor
          visible={showInlineEditor}
          initialLyrics={activeSong.lyrics}
          title={activeSong.title}
          onCancel={() => setShowInlineEditor(false)}
          onSave={(lyrics) => {
            updateSong({ ...activeSong, lyrics, updatedAt: Date.now() });
            setShowInlineEditor(false);
          }}
        />
      ) : null}

      <MicPermissionRationale
        visible={showMicRationale}
        onAllow={() => {
          setShowMicRationale(false);
          void recording.requestPermission().then((granted) => {
            if (granted) {
              void handleRecordPress();
            }
          });
        }}
        onCancel={() => setShowMicRationale(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  singHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  screenTitle: { color: Colors.textPrimary, fontSize: 20, fontFamily: 'Inter_700Bold' },
  brandCrop: { width: 130, height: 38, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  brandLogo: { width: 240, height: 160, position: 'absolute' },
  songScroll: { flex: 1 },
  songScrollContent: { paddingTop: 12, paddingBottom: 24 },
  songHeading: { gap: 4, paddingBottom: 14 },
  eyebrow: { color: Colors.gradientMid, fontSize: 11, letterSpacing: 1.6, fontFamily: 'Inter_600SemiBold' },
  recordingSongTitle: { fontSize: 18, lineHeight: 25 },
  songMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  editText: { color: Colors.textSecondary, fontSize: 13, fontFamily: 'Inter_500Medium' },
  preparationToggle: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderGlass, backgroundColor: Colors.surface },
  preparationCopy: { flex: 1, gap: 3 },
  preparationTitle: { color: Colors.textPrimary, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  preparationHint: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18 },
  preparationBody: { gap: 12, paddingVertical: 12 },
  shortcutLabel: { color: Colors.textPrimary, fontSize: 12, fontFamily: 'Inter_500Medium' },
  lyricsLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  recordingStatus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  recordingHint: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18 },
  songSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
  },
  songTitle: {
    color: Colors.textPrimary,
    flex: 1,
    fontSize: 26,
    lineHeight: 33,
    fontFamily: 'Inter_700Bold',
  },
  draftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    zIndex: 50,
    elevation: 6,
  },
  draftBannerTitle: {
    color: Colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  draftBannerSubtitle: {
    color: Colors.textTertiary,
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    marginTop: 1,
  },
  editLyricsBtn: {
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 6,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  genreBadge: {
    borderColor: Colors.borderGlass,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  genreBadgeText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  quickDockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickDockBtn: {
    flex: 1,
    minHeight: 86,
    padding: 8,
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    overflow: 'hidden',
  },
  quickDockIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
  },
  lyricsArea: { paddingTop: 20, gap: 12 },
  coachArea: {
    minHeight: 40,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  controls: {
    paddingHorizontal: 20,
    gap: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderGlass,
    backgroundColor: Colors.background,
  },
  primaryActionStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  primaryActionStateText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  primaryActionTimer: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  transportRow: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
  transportLabel: { position: 'absolute', bottom: -18, fontSize: 10, color: Colors.textSecondary, textAlign: 'center', width: 64 },
  transportIconActive: { backgroundColor: Colors.accentSubtle, borderRadius: 8 },
  transportIconShell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
