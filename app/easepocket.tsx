import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { AudioModule, useAudioPlayer } from "expo-audio";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/AppContext";
import { useRecording } from "@/lib/useRecording";
import { analyzeConsonantPrecision, type EasePocketGrid as ApiGrid } from "@/lib/easepocket-client";
import { ingestEasePocketLearningEvent } from "@/lib/learning-client";
import { goBackWithFallback } from "@/lib/navigation";
import * as Storage from "@/lib/storage";
import { scaledIconSize, tierValue, useResponsiveLayout } from "@/lib/responsive";
import Toast from "@/components/Toast";

type ModeId = Storage.EasePocketMode;
type Grid = Storage.EasePocketGrid;

type TapEvent = {
  tMs: number;
  expectedMs: number;
  deviationMs: number;
  cls: "early" | "on" | "late";
};

type TapStats = {
  eventCount: number;
  onTimePct: number;
  meanAbsMs: number;
  stdDevMs: number;
  avgOffsetMs: number;
};

function nowMs(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  if (perf?.now) return perf.now();
  return Date.now();
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function stdDev(values: number[], meanValue?: number): number {
  if (values.length <= 1) return 0;
  const m = meanValue ?? mean(values);
  let variance = 0;
  for (const v of values) {
    const d = v - m;
    variance += d * d;
  }
  variance /= values.length;
  return Math.sqrt(variance);
}

function computeTapStats(events: TapEvent[]): TapStats {
  const deviations = events.map((e) => e.deviationMs);
  const abs = deviations.map((d) => Math.abs(d));
  const avgOffsetMs = mean(deviations);
  const meanAbsMs = mean(abs);
  const stdDevMs = stdDev(deviations, avgOffsetMs);
  const onTimeCount = events.filter((e) => e.cls === "on").length;
  const onTimePct = events.length ? (onTimeCount / events.length) * 100 : 0;
  return { eventCount: events.length, onTimePct, meanAbsMs, stdDevMs, avgOffsetMs };
}

function gridStepMs(bpm: number, grid: Grid): number {
  const beatMs = 60000 / bpm;
  if (grid === "beat") return beatMs;
  if (grid === "8th") return beatMs / 2;
  return beatMs / 4;
}

function formatMs(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}ms`;
}

function formatPct(value: number): string {
  return `${Math.round(value)}%`;
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const modeCards: {
  id: ModeId;
  title: string;
  subtitle: string;
}[] = [
  {
    id: "subdivision",
    title: "Subdivision Lab",
    subtitle: "Tap subdivisions. The grid switches to train real pocket.",
  },
  {
    id: "silent",
    title: "Silent Beat Challenge",
    subtitle: "The click drops out. Hold the beat, then measure drift.",
  },
  {
    id: "consonant",
    title: "Consonant Precision",
    subtitle: "Record a lyric take and score consonant attacks in ms.",
  },
  {
    id: "pocket",
    title: "Pocket Control",
    subtitle: "Push it, lay back, or center. Hit the target offset.",
  },
  {
    id: "slow",
    title: "Slow Mastery",
    subtitle: "Drop BPM down to 40 and build rock-solid internal pulse.",
  },
];

const easePocketIcon =
  Platform.OS === "web"
    ? require("@/assets/images/EasePocket.webp")
    : require("@/assets/images/EasePocket.png");
const bpmIconSource =
  Platform.OS === "web"
    ? require("@/assets/images/bpm_icon.webp")
    : require("@/assets/images/bpm_icon.png");
const twoBeatsIconSource =
  Platform.OS === "web"
    ? require("@/assets/images/two_beats.webp")
    : require("@/assets/images/two_beats.png");
const fourBeatsIconSource =
  Platform.OS === "web"
    ? require("@/assets/images/four_beats.webp")
    : require("@/assets/images/four_beats.png");

export default function EasePocketScreen() {
  const insets = useSafeAreaInsets();
  const responsive = useResponsiveLayout();
  const { activeSong } = useApp();
  const recording = useRecording();
  const metronomePlayer = useAudioPlayer(require("@/assets/sounds/metronome-click.wav"));

  const [mode, setMode] = useState<ModeId>("subdivision");
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [prefs, setPrefs] = useState<Storage.EasePocketPrefs>({
    grid: "16th",
    beatsPerBar: 4,
  });
  const [history, setHistory] = useState<Storage.EasePocketHistoryItem[]>([]);

  const [bpmText, setBpmText] = useState<string>("");
  const songBpm = typeof activeSong?.bpm === "number" && Number.isFinite(activeSong.bpm) ? activeSong.bpm : null;

  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState<"idle" | "audible" | "silent" | "done">("idle");
  const [subDiv, setSubDiv] = useState<2 | 4>(4);
  const [pocketTarget, setPocketTarget] = useState<"push" | "center" | "layback">("center");
  const [feedbackText, setFeedbackText] = useState<string>("");
  const [tapEvents, setTapEvents] = useState<TapEvent[]>([]);
  const [tapStats, setTapStats] = useState<TapStats | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [consonantScore, setConsonantScore] = useState<Awaited<ReturnType<typeof analyzeConsonantPrecision>>>(null);
  const [toast, setToast] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: "",
  });
  const lastToastErrorRef = useRef<string | null>(null);
  const recordingIsActiveRef = useRef(recording.isRecording);
  const recordingStopRef = useRef(recording.stop);

  const startEpochRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);
  const modeRef = useRef<ModeId>("subdivision");
  const phaseRef = useRef<"idle" | "audible" | "silent" | "done">("idle");
  const tapsRef = useRef<TapEvent[]>([]);
  const tickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const subdivisionSwitchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pocketPromptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rotation = useRef(new Animated.Value(0)).current;

  const effectiveBpm = useMemo(() => {
    const parsed = Number.parseInt(bpmText.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return clamp(parsed, 40, 300);
    }
    if (prefs.lastBpmOverride) {
      return clamp(prefs.lastBpmOverride, 40, 300);
    }
    if (songBpm) {
      return clamp(Math.round(songBpm), 40, 300);
    }
    return 120;
  }, [bpmText, prefs.lastBpmOverride, songBpm]);

  const beatMs = useMemo(() => Math.round(60000 / effectiveBpm), [effectiveBpm]);
  const barMs = useMemo(() => beatMs * prefs.beatsPerBar, [beatMs, prefs.beatsPerBar]);

  const currentGrid: Grid = useMemo(() => {
    if (mode === "subdivision") {
      return subDiv === 2 ? "8th" : "16th";
    }
    if (mode === "silent") {
      return "beat";
    }
    if (mode === "pocket") {
      return "beat";
    }
    if (mode === "slow") {
      return prefs.grid;
    }
    return prefs.grid;
  }, [mode, prefs.grid, subDiv]);

  const toleranceMs = useMemo(() => {
    // Keep a slightly wider band on slow tempos; tighter otherwise.
    if (effectiveBpm <= 60) return 22;
    return 15;
  }, [effectiveBpm]);

  const visualEnabled = !(mode === "silent" && phase === "silent");

  const stopTick = useCallback(() => {
    if (tickTimeoutRef.current) {
      clearTimeout(tickTimeoutRef.current);
      tickTimeoutRef.current = null;
    }
  }, []);

  const stopPhaseTimeouts = useCallback(() => {
    for (const t of phaseTimeoutsRef.current) {
      clearTimeout(t);
    }
    phaseTimeoutsRef.current = [];
  }, []);

  const stopSubdivisionScheduler = useCallback(() => {
    if (subdivisionSwitchTimeoutRef.current) {
      clearTimeout(subdivisionSwitchTimeoutRef.current);
      subdivisionSwitchTimeoutRef.current = null;
    }
  }, []);

  const stopPocketPromptScheduler = useCallback(() => {
    if (pocketPromptTimeoutRef.current) {
      clearTimeout(pocketPromptTimeoutRef.current);
      pocketPromptTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!recording.error) return;
    if (recording.error === lastToastErrorRef.current) return;
    lastToastErrorRef.current = recording.error;
    setToast({ visible: true, message: recording.error });
  }, [recording.error]);

  const hardStop = useCallback(() => {
    setIsRunning(false);
    isRunningRef.current = false;
    setPhase("idle");
    phaseRef.current = "idle";
    startEpochRef.current = null;
    tapsRef.current = [];
    setTapEvents([]);
    setTapStats(null);
    setFeedbackText("");
    stopTick();
    stopPhaseTimeouts();
    stopSubdivisionScheduler();
    stopPocketPromptScheduler();
    
    // Stop metronome to prevent lingering clicks
    try {
      metronomePlayer.pause();
      void metronomePlayer.seekTo(0).catch(() => undefined);
    } catch {
      // Ignore metronome cleanup failures
    }
  }, [stopPhaseTimeouts, stopPocketPromptScheduler, stopSubdivisionScheduler, stopTick, metronomePlayer]);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    recordingIsActiveRef.current = recording.isRecording;
    recordingStopRef.current = recording.stop;
  }, [recording.isRecording, recording.stop]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loadedPrefs = await Storage.getEasePocketPrefs();
      const loadedHistory = await Storage.getEasePocketHistory();
      if (cancelled) return;
      setPrefs(loadedPrefs);
      setHistory(loadedHistory);
      setPrefsLoaded(true);
      if (!loadedPrefs.lastBpmOverride && songBpm) {
        setBpmText(String(Math.round(songBpm)));
      } else if (loadedPrefs.lastBpmOverride) {
        setBpmText(String(Math.round(loadedPrefs.lastBpmOverride)));
      } else if (songBpm) {
        setBpmText(String(Math.round(songBpm)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [songBpm]);

  useEffect(() => {
    if (!prefsLoaded) return;
    const timeoutId = setTimeout(() => {
      void Storage.saveEasePocketPrefs({ ...prefs, lastBpmOverride: effectiveBpm });
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [effectiveBpm, prefs, prefsLoaded]);

  const playMetronomeTick = useCallback(
    (accent: boolean) => {
      if (Platform.OS !== "web") {
        void Haptics.selectionAsync();
      }
      try {
        metronomePlayer.volume = accent ? 0.42 : 0.28;
        void metronomePlayer.seekTo(0).catch(() => undefined);
        metronomePlayer.play();
      } catch {
        // Ignore click failures; haptics still provides usable timing.
      }
    },
    [metronomePlayer]
  );

  const scheduleNextTick = useCallback(
    async (startEpoch: number) => {
      stopTick();
      try {
        await AudioModule.setAudioModeAsync({ playsInSilentMode: true });
      } catch {
        // Ignore audio mode failures.
      }

      const loop = () => {
        if (!isRunningRef.current) return;
        if (modeRef.current === "silent" && phaseRef.current === "silent") return;
        const now = nowMs();
        const elapsed = now - startEpoch;
        const beatIndex = Math.max(0, Math.ceil(elapsed / beatMs));
        const expected = startEpoch + beatIndex * beatMs;
        const delay = Math.max(0, expected - now);
        tickTimeoutRef.current = setTimeout(() => {
          if (!isRunningRef.current) return;
          if (modeRef.current === "silent" && phaseRef.current === "silent") return;
          const beatNumber = (beatIndex % prefs.beatsPerBar) + 1;
          playMetronomeTick(beatNumber === 1);
          loop();
        }, delay);
      };

      loop();
    },
    [beatMs, playMetronomeTick, prefs.beatsPerBar, stopTick]
  );

  useEffect(() => {
    if (!isRunning || !visualEnabled) {
      rotation.stopAnimation();
      rotation.setValue(0);
      return;
    }
    rotation.setValue(0);
    const anim = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: Math.max(300, barMs),
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [barMs, isRunning, rotation, visualEnabled]);

  const rotationStyle = useMemo(() => {
    const rotate = rotation.interpolate({
      inputRange: [0, 1],
      outputRange: ["0deg", "360deg"],
    });
    return { transform: [{ rotate }] };
  }, [rotation]);

  const scoreTap = useCallback(
    (tapTimeMs: number) => {
      const startEpoch = startEpochRef.current;
      if (startEpoch === null) return;

      const baseStepMs = gridStepMs(effectiveBpm, currentGrid);
      const tSinceStart = tapTimeMs - startEpoch;
      const k = Math.round(tSinceStart / baseStepMs);

      let targetOffsetMs = 0;
      if (mode === "pocket") {
        targetOffsetMs = pocketTarget === "push" ? -20 : pocketTarget === "layback" ? 20 : 0;
      }

      const expectedMs = startEpoch + k * baseStepMs + targetOffsetMs;
      const deviationMs = tapTimeMs - expectedMs;
      const absDev = Math.abs(deviationMs);
      const cls = absDev <= toleranceMs ? "on" : deviationMs < 0 ? "early" : "late";

      const event: TapEvent = { tMs: tapTimeMs, expectedMs, deviationMs, cls };
      tapsRef.current = [...tapsRef.current, event].slice(-80);
      setTapEvents(tapsRef.current);

      const label =
        cls === "on"
          ? `On (${formatMs(deviationMs)})`
          : cls === "early"
            ? `Early by ${Math.abs(Math.round(deviationMs))}ms`
            : `Late by ${Math.abs(Math.round(deviationMs))}ms`;
      setFeedbackText(label);

      const stats = computeTapStats(tapsRef.current);
      setTapStats(stats);
    },
    [currentGrid, effectiveBpm, mode, pocketTarget, toleranceMs]
  );

  const handleTap = useCallback(() => {
    if (!isRunning) {
      return;
    }
    const t = nowMs();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scoreTap(t);
  }, [isRunning, scoreTap]);

  const persistResult = useCallback(
    async (params: { mode: ModeId; label: string; bpm: number; grid: Grid; beatsPerBar: 2 | 4; stats: TapStats }) => {
      const item: Storage.EasePocketHistoryItem = {
        id: Storage.generateId(),
        mode: params.mode,
        createdAt: Date.now(),
        bpm: params.bpm,
        grid: params.grid,
        beatsPerBar: params.beatsPerBar,
        label: params.label,
        stats: params.stats,
      };
      await Storage.addEasePocketHistoryItem(item);
      const loaded = await Storage.getEasePocketHistory();
      setHistory(loaded);
      void ingestEasePocketLearningEvent({ item });
    },
    []
  );

  const finishTapMode = useCallback(async () => {
    setIsRunning(false);
    isRunningRef.current = false;
    setPhase("done");
    phaseRef.current = "done";
    stopTick();
    stopPhaseTimeouts();
    stopSubdivisionScheduler();
    stopPocketPromptScheduler();
    const stats = computeTapStats(tapsRef.current);
    setTapStats(stats);

    if (stats.eventCount >= 3) {
      const label =
        mode === "subdivision"
          ? `Subdivision Lab (${subDiv === 2 ? "8ths" : "16ths"})`
          : mode === "silent"
            ? "Silent Beat Challenge"
            : mode === "pocket"
              ? `Pocket Control (${pocketTarget})`
              : "Slow Mastery";
      await persistResult({
        mode,
        label,
        bpm: effectiveBpm,
        grid: currentGrid,
        beatsPerBar: prefs.beatsPerBar,
        stats,
      });
    }
  }, [
    currentGrid,
    effectiveBpm,
    mode,
    persistResult,
    prefs.beatsPerBar,
    pocketTarget,
    stopPhaseTimeouts,
    stopPocketPromptScheduler,
    stopSubdivisionScheduler,
    stopTick,
    subDiv,
  ]);

  const startTapMode = useCallback(async () => {
    setConsonantScore(null);
    setTapStats(null);
    setFeedbackText("");
    tapsRef.current = [];
    setTapEvents([]);

    const startEpoch = nowMs();
    startEpochRef.current = startEpoch;
    isRunningRef.current = true;
    setIsRunning(true);
    setPhase("audible");
    phaseRef.current = "audible";

    await scheduleNextTick(startEpoch);

    if (mode === "silent") {
      stopPhaseTimeouts();
      const audible1 = 2 * barMs;
      const silent = 2 * barMs;
      const audible2 = 2 * barMs;

      phaseTimeoutsRef.current.push(
        setTimeout(() => {
          setPhase("silent");
          phaseRef.current = "silent";
          stopTick();
          setFeedbackText("Silent... keep tapping");
        }, audible1)
      );
      phaseTimeoutsRef.current.push(
        setTimeout(() => {
          setPhase("audible");
          phaseRef.current = "audible";
          setFeedbackText("Click returns. Hold steady.");
          if (startEpochRef.current !== null) {
            void scheduleNextTick(startEpochRef.current);
          }
        }, audible1 + silent)
      );
      phaseTimeoutsRef.current.push(
        setTimeout(() => {
          void finishTapMode();
        }, audible1 + silent + audible2)
      );
    }

    if (mode === "subdivision") {
      stopSubdivisionScheduler();
      const maybeSwitch = () => {
        if (!isRunningRef.current) return;
        const next = Math.random() < 0.5 ? 2 : 4;
        setSubDiv(next);
        // Reset the segment so the grid stays consistent after a switch.
        startEpochRef.current = nowMs();
        tapsRef.current = [];
        setTapEvents([]);
        setTapStats(null);
        setFeedbackText(next === 2 ? "Subdivision: 8ths" : "Subdivision: 16ths");
        if (startEpochRef.current !== null) {
          void scheduleNextTick(startEpochRef.current);
        }
        subdivisionSwitchTimeoutRef.current = setTimeout(maybeSwitch, 2 * barMs);
      };
      subdivisionSwitchTimeoutRef.current = setTimeout(maybeSwitch, 2 * barMs);
    }

    if (mode === "pocket") {
      stopPocketPromptScheduler();
      const prompts: ("push" | "center" | "layback")[] = ["push", "center", "layback"];
      let idx = 0;
      const nextPrompt = () => {
        if (!isRunningRef.current) return;
        idx = (idx + 1) % prompts.length;
        const next = prompts[idx];
        setPocketTarget(next);
        tapsRef.current = [];
        setTapEvents([]);
        setTapStats(null);
        setFeedbackText(next === "push" ? "Push it (ahead)" : next === "layback" ? "Lay back (behind)" : "Center (on)");
        pocketPromptTimeoutRef.current = setTimeout(nextPrompt, 3 * barMs);
      };
      setPocketTarget(prompts[0]);
      setFeedbackText("Push it (ahead)");
      pocketPromptTimeoutRef.current = setTimeout(nextPrompt, 3 * barMs);
    }

    if (mode === "slow") {
      // No auto-finish: user stops when ready.
    }
  }, [
    barMs,
    finishTapMode,
    mode,
    scheduleNextTick,
    stopPhaseTimeouts,
    stopPocketPromptScheduler,
    stopSubdivisionScheduler,
    stopTick,
  ]);

  useEffect(() => {
    // Stop all timers if mode changes.
    hardStop();
    setSubDiv(4);
    setPocketTarget("center");
    
    // Stop recording if switching away from consonant mode
    if (recordingIsActiveRef.current) {
      void recordingStopRef.current();
    }
  }, [hardStop, mode]);

  useEffect(() => {
    return () => {
      hardStop();
      // Stop recording on unmount if active
      if (recordingIsActiveRef.current) {
        void recordingStopRef.current();
      }
    };
  }, [hardStop]);

  const startOrStop = useCallback(() => {
    if (isRunning) {
      void finishTapMode();
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void startTapMode();
  }, [finishTapMode, isRunning, startTapMode]);

  const runConsonantMode = useCallback(async () => {
    if (isAnalyzing) return;

    if (!recording.isRecording) {
      setConsonantScore(null);
      setTapStats(null);
      setFeedbackText("Recording...");
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const started = await recording.start();
      if (!started) {
        setFeedbackText(recording.error ?? "Recording failed. Check mic permission.");
      }
      return;
    }

    const result = await recording.stop();
    if (!result.uri) {
      setFeedbackText("Recording failed. Check mic permission.");
      return;
    }

    setIsAnalyzing(true);
    setFeedbackText("Analyzing consonants...");
    try {
      const score = await analyzeConsonantPrecision({
        recordingUri: result.uri,
        bpm: effectiveBpm,
        grid: (prefs.grid as ApiGrid) ?? "16th",
        toleranceMs,
        maxEvents: 120,
      });
      setConsonantScore(score);
      if (!score) {
        setFeedbackText("Analysis failed. Check server connectivity.");
        return;
      }

      setFeedbackText(
        `On-time: ${formatPct(score.stats.onTimePct)} • Mean: ${Math.round(score.stats.meanAbsMs)}ms`
      );

      await persistResult({
        mode: "consonant",
        label: "Consonant Precision",
        bpm: effectiveBpm,
        grid: prefs.grid,
        beatsPerBar: prefs.beatsPerBar,
        stats: {
          eventCount: score.stats.eventCount,
          onTimePct: score.stats.onTimePct,
          meanAbsMs: score.stats.meanAbsMs,
          stdDevMs: score.stats.stdDevMs,
          avgOffsetMs: score.stats.avgOffsetMs,
        },
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [
    effectiveBpm,
    isAnalyzing,
    persistResult,
    prefs.beatsPerBar,
    prefs.grid,
    recording,
    toleranceMs,
  ]);

  const bpmLabel = useMemo(() => {
    if (songBpm && Math.round(songBpm) === effectiveBpm) {
      return "BPM (Song)";
    }
    return "BPM (Practice)";
  }, [effectiveBpm, songBpm]);

  const canTap = isRunning && mode !== "consonant";
  const horizontalInset = responsive.contentPadding;
  const contentMaxWidth = responsive.contentMaxWidth;
  const sectionWrapStyle = useMemo(
    () => ({ width: "100%" as const, maxWidth: contentMaxWidth, alignSelf: "center" as const }),
    [contentMaxWidth]
  );
  const iconDisplayScale = responsive.isWeb ? 1 + (responsive.highResScale - 1) * 0.9 : 1;
  const scaleDisplay = (value: number) => Math.round(value * iconDisplayScale);
  const topIconSize = scaleDisplay(tierValue(responsive.tier, [28, 30, 32, 34, 40, 46, 52]));
  const circleSize = tierValue(responsive.tier, [192, 210, 226, 240, 272, 312, 352]);
  const circleRadius = Math.round(circleSize / 2);
  const centerSize = Math.round(circleSize * 0.71);
  const centerRadius = Math.round(centerSize / 2);
  const circleDotSize = tierValue(responsive.tier, [12, 13, 14, 14, 16, 18, 20]);
  const centerTitleSize = tierValue(responsive.tier, [18, 20, 21, 22, 24, 28, 32]);
  const centerSubSize = tierValue(responsive.tier, [12, 13, 13, 14, 15, 16, 18]);
  const controlIconSize = scaleDisplay(tierValue(responsive.tier, [28, 32, 36, 42, 52, 64, 78]));
  const scaledIcon = useMemo(
    () => (size: number) => scaledIconSize(size, responsive),
    [responsive]
  );

  const activeModeCard = useMemo(() => modeCards.find((m) => m.id === mode) ?? modeCards[0], [mode]);

  const gridOptions: { id: Grid; label: string }[] = [
    { id: "beat", label: "Beat" },
    { id: "8th", label: "8th" },
    { id: "16th", label: "16th" },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <Toast
        visible={toast.visible}
        message={toast.message}
        variant="error"
        onHide={() => setToast((current) => ({ ...current, visible: false }))}
      />
      <View style={[styles.topBar, sectionWrapStyle, { paddingHorizontal: horizontalInset }]}>
        <Pressable
          onPress={() => goBackWithFallback(router, "/")}
          hitSlop={12}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the previous screen"
        >
          <Ionicons name="arrow-back" size={scaledIcon(14)} color={Colors.textPrimary} />
        </Pressable>
        <View style={styles.topBarTitleWrap}>
          <Image
            source={easePocketIcon}
            style={[
              styles.topBarIcon,
              {
                width: topIconSize,
                height: topIconSize,
                borderRadius: Math.round(topIconSize * 0.28),
              },
            ]}
            resizeMode="contain"
          />
          <Text style={styles.topBarTitle} accessibilityRole="header">
            EasePocket
          </Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, Platform.OS === "web" ? 34 : 0) + 120,
        }}
      >
        <View style={[styles.modeStrip, sectionWrapStyle, { paddingHorizontal: horizontalInset }]}>
          {modeCards.map((m) => {
            const selected = m.id === mode;
            return (
              <Pressable
                key={m.id}
                style={[styles.modePill, selected && styles.modePillSelected]}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setMode(m.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={m.title}
                accessibilityHint={m.subtitle}
              >
                <Text style={[styles.modePillText, selected && styles.modePillTextSelected]}>
                  {m.title}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.heroCard, sectionWrapStyle, { marginHorizontal: horizontalInset }]}>
          <View style={styles.heroHeader}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>{activeModeCard.title}</Text>
              <Text style={styles.heroSubtitle}>{activeModeCard.subtitle}</Text>
            </View>
            {songBpm ? (
              <View style={styles.songBpmBadge}>
                <Ionicons name="musical-note" size={scaledIcon(9)} color={Colors.textSecondary} />
                <Text style={styles.songBpmText}>{Math.round(songBpm)} BPM</Text>
              </View>
            ) : (
              <Pressable
                style={styles.songBpmBadge}
                onPress={() => router.push("/(tabs)/lyrics")}
                accessibilityRole="button"
                accessibilityLabel="Set BPM"
                accessibilityHint="Opens Lyrics to set Tempo (BPM)"
              >
                <Ionicons name="add-circle-outline" size={scaledIcon(9)} color={Colors.textSecondary} />
                <Text style={styles.songBpmText}>Set BPM</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.controlsRow}>
            <View style={styles.controlCard}>
              <View style={styles.controlLabelRow}>
                <Image
                  source={bpmIconSource}
                  style={[styles.controlIcon, { width: controlIconSize, height: controlIconSize }]}
                  resizeMode="contain"
                />
                <Text style={styles.controlLabel}>{bpmLabel}</Text>
              </View>
              <View style={styles.bpmRow}>
                <Pressable
                  style={styles.smallBtn}
                  onPress={() => setBpmText(String(clamp(effectiveBpm - 1, 40, 300)))}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease BPM"
                >
                  <Ionicons name="remove" size={scaledIcon(11)} color={Colors.textPrimary} />
                </Pressable>
                <TextInput
                  value={String(effectiveBpm)}
                  onChangeText={setBpmText}
                  keyboardType="number-pad"
                  style={styles.bpmInput}
                  accessibilityLabel="BPM"
                  accessibilityHint="Sets the practice tempo in beats per minute"
                />
                <Pressable
                  style={styles.smallBtn}
                  onPress={() => setBpmText(String(clamp(effectiveBpm + 1, 40, 300)))}
                  accessibilityRole="button"
                  accessibilityLabel="Increase BPM"
                >
                  <Ionicons name="add" size={scaledIcon(11)} color={Colors.textPrimary} />
                </Pressable>
              </View>
              <Text style={styles.controlHint}>
                {mode === "slow" ? "Slow Mastery supports down to 40 BPM." : "Tempo drives the grid + click."}
              </Text>
            </View>

            <View style={styles.controlCard}>
              <View style={styles.controlLabelRow}>
                <Image
                  source={prefs.beatsPerBar === 2 ? twoBeatsIconSource : fourBeatsIconSource}
                  style={[
                    styles.controlIcon,
                    {
                      width: Math.round(controlIconSize * (prefs.beatsPerBar === 4 ? 1.22 : 1)),
                      height: Math.round(controlIconSize * (prefs.beatsPerBar === 4 ? 1.22 : 1)),
                    },
                  ]}
                  resizeMode="contain"
                />
                <Text style={styles.controlLabel}>Beats</Text>
              </View>
              <View style={styles.beatsRow}>
                <Pressable
                  style={[styles.beatToggle, prefs.beatsPerBar === 2 && styles.beatToggleSelected]}
                  onPress={() => setPrefs((p) => ({ ...p, beatsPerBar: 2 }))}
                  accessibilityRole="button"
                  accessibilityLabel="Two beats"
                  accessibilityState={{ selected: prefs.beatsPerBar === 2 }}
                >
                  <Text style={styles.beatToggleText}>2</Text>
                </Pressable>
                <Pressable
                  style={[styles.beatToggle, prefs.beatsPerBar === 4 && styles.beatToggleSelected]}
                  onPress={() => setPrefs((p) => ({ ...p, beatsPerBar: 4 }))}
                  accessibilityRole="button"
                  accessibilityLabel="Four beats"
                  accessibilityState={{ selected: prefs.beatsPerBar === 4 }}
                >
                  <Text style={styles.beatToggleText}>4</Text>
                </Pressable>
              </View>
              <Text style={styles.controlHint}>Accents beat 1 every bar.</Text>
            </View>
          </View>

          {(mode === "slow" || mode === "consonant") && (
            <View style={styles.controlCardWide}>
              <View style={styles.controlLabelRow}>
                <Ionicons name="grid-outline" size={scaledIcon(10)} color={Colors.textSecondary} />
                <Text style={styles.controlLabel}>Grid</Text>
              </View>
              <View style={styles.gridRow}>
                {gridOptions.map((opt) => {
                  const selected = prefs.grid === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      style={[styles.gridChip, selected && styles.gridChipSelected]}
                      onPress={() => setPrefs((p) => ({ ...p, grid: opt.id }))}
                      accessibilityRole="button"
                      accessibilityLabel={opt.label}
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.gridChipText, selected && styles.gridChipTextSelected]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.controlHint}>
                {mode === "consonant" ? "16th grid is recommended for tight syllables." : "Choose your subdivision for stability work."}
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.trainerCard, sectionWrapStyle, { marginHorizontal: horizontalInset }]}>
          <View style={styles.circleWrap}>
            <View
              style={[
                styles.circleOuter,
                {
                  width: circleSize,
                  height: circleSize,
                  borderRadius: circleRadius,
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.circleRotator,
                  { width: circleSize, height: circleSize },
                  rotationStyle,
                  !visualEnabled && { opacity: 0.1 },
                ]}
              >
                <View
                  style={[
                    styles.circleDot,
                    {
                      width: circleDotSize,
                      height: circleDotSize,
                      borderRadius: Math.round(circleDotSize / 2),
                    },
                  ]}
                />
              </Animated.View>
              <View
                style={[
                  styles.circleCenter,
                  {
                    width: centerSize,
                    height: centerSize,
                    borderRadius: centerRadius,
                  },
                ]}
              >
                <Text style={[styles.circleTitle, { fontSize: centerTitleSize }]}>
                  {mode === "subdivision"
                    ? subDiv === 2
                      ? "8ths"
                      : "16ths"
                    : mode === "silent"
                      ? phase === "silent"
                        ? "Silence"
                        : "Beat"
                      : mode === "pocket"
                        ? pocketTarget.toUpperCase()
                        : mode === "slow"
                          ? prefs.grid.toUpperCase()
                          : "REC"}
                </Text>
                <Text style={[styles.circleSub, { fontSize: centerSubSize }]}>{effectiveBpm} BPM</Text>
              </View>
            </View>
          </View>

          <View style={styles.actionRow}>
            {mode === "consonant" ? (
              <Pressable
                style={[styles.primaryAction, recording.isRecording && styles.primaryActionRecording]}
                onPress={runConsonantMode}
                accessibilityRole="button"
                accessibilityLabel={recording.isRecording ? "Stop recording" : "Start recording"}
                accessibilityHint="Records a short take then scores consonant timing"
              >
                {isAnalyzing ? (
                  <ActivityIndicator color="#111" />
                ) : (
                  <>
                    <Ionicons
                      name={recording.isRecording ? "stop" : "mic"}
                      size={scaledIcon(11)}
                      color="#111"
                    />
                    <Text style={styles.primaryActionText}>
                      {recording.isRecording ? "Stop + Analyze" : "Record Take"}
                    </Text>
                  </>
                )}
              </Pressable>
            ) : (
              <>
                <Pressable
                  style={[styles.primaryAction, isRunning && styles.primaryActionRecording]}
                  onPress={startOrStop}
                  accessibilityRole="button"
                  accessibilityLabel={isRunning ? "Stop" : "Start"}
                  accessibilityHint="Starts or stops the drill"
                >
                  <Ionicons name={isRunning ? "stop" : "play"} size={scaledIcon(11)} color="#111" />
                  <Text style={styles.primaryActionText}>{isRunning ? "Stop" : "Start"}</Text>
                </Pressable>

                <Pressable
                  style={[styles.tapBtn, !canTap && styles.tapBtnDisabled]}
                  onPress={handleTap}
                  disabled={!canTap}
                  accessibilityRole="button"
                  accessibilityLabel="Tap"
                  accessibilityHint="Tap on the grid to measure microtiming"
                  accessibilityState={{ disabled: !canTap }}
                >
                  <Text style={styles.tapBtnText}>Tap</Text>
                </Pressable>
              </>
            )}
          </View>

          <Text style={styles.feedbackText} accessibilityLiveRegion="polite">
            {feedbackText || (mode === "consonant" ? "Record a short phrase with clear consonants." : "Start, then tap the grid.")}
          </Text>

          {tapStats && mode !== "consonant" && (
            <View style={styles.statsRow}>
              <StatPill
                label="On-Time"
                value={formatPct(tapStats.onTimePct)}
                color={tapStats.onTimePct > 70 ? Colors.successUnderline : tapStats.onTimePct > 45 ? Colors.warningUnderline : Colors.dangerUnderline}
              />
              <StatPill label="Mean" value={formatMs(tapStats.meanAbsMs)} color={Colors.textSecondary} />
              <StatPill label="Offset" value={formatMs(tapStats.avgOffsetMs)} color={Colors.textSecondary} />
            </View>
          )}

          {tapEvents.length > 0 && mode !== "consonant" && (
            <View style={styles.tapEventCard}>
              <Text style={styles.tapEventTitle}>Last taps</Text>
              <View style={styles.eventList}>
                {tapEvents
                  .slice(-8)
                  .reverse()
                  .map((e, idx) => {
                    const color =
                      e.cls === "on"
                        ? Colors.successUnderline
                        : e.cls === "early"
                          ? Colors.warningUnderline
                          : Colors.dangerUnderline;
                    return (
                      <View key={`${idx}-${e.tMs}`} style={styles.eventRow}>
                        <Text style={styles.eventTime}>{Math.round(e.tMs)}ms</Text>
                        <Text style={[styles.eventDev, { color }]}>
                          {e.cls === "on" ? "On" : e.cls === "early" ? "Early" : "Late"} {formatMs(e.deviationMs)}
                        </Text>
                        <Text style={styles.eventConf}>
                          {Math.round(Math.abs(e.deviationMs))}ms
                        </Text>
                      </View>
                    );
                  })}
              </View>
            </View>
          )}

          {consonantScore?.ok && (
            <View style={styles.consonantCard}>
              <View style={styles.statsRow}>
                <StatPill
                  label="On-Time"
                  value={formatPct(consonantScore.stats.onTimePct)}
                  color={consonantScore.stats.onTimePct > 70 ? Colors.successUnderline : consonantScore.stats.onTimePct > 45 ? Colors.warningUnderline : Colors.dangerUnderline}
                />
                <StatPill label="Mean" value={formatMs(consonantScore.stats.meanAbsMs)} color={Colors.textSecondary} />
                <StatPill label="Offset" value={formatMs(consonantScore.stats.avgOffsetMs)} color={Colors.textSecondary} />
              </View>

              <View style={styles.eventList}>
                {consonantScore.events.slice(0, 10).map((e, idx) => {
                  const color =
                    e.class === "on"
                      ? Colors.successUnderline
                      : e.class === "early"
                        ? Colors.warningUnderline
                        : Colors.dangerUnderline;
                  return (
                    <View key={`${idx}-${e.tMs}`} style={styles.eventRow}>
                      <Text style={styles.eventTime}>
                        {Math.round(e.tMs)}ms
                      </Text>
                      <Text style={[styles.eventDev, { color }]}>
                        {e.class === "on" ? "On" : e.class === "early" ? "Early" : "Late"} {formatMs(e.deviationMs)}
                      </Text>
                      <Text style={styles.eventConf}>
                        {Math.round(e.confidence * 100)}%
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        <View style={[styles.historyCard, sectionWrapStyle, { marginHorizontal: horizontalInset }]}>
          <View style={styles.historyHeader}>
            <Ionicons name="time-outline" size={scaledIcon(11)} color={Colors.textSecondary} />
            <Text style={styles.historyTitle}>History</Text>
          </View>

          {history.length === 0 ? (
            <Text style={styles.historyEmpty}>No EasePocket drills yet. Start a mode to log results.</Text>
          ) : (
            <View style={styles.historyList}>
              {history.slice(0, 6).map((item) => (
                <View key={item.id} style={styles.historyRow}>
                  <View style={styles.historyLeft}>
                    <Text style={styles.historyLabel}>{item.label}</Text>
                    <Text style={styles.historyMeta}>
                      {item.bpm} BPM • {item.grid.toUpperCase()} • {item.beatsPerBar}/4
                    </Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={styles.historyStat}>{formatPct(item.stats.onTimePct)}</Text>
                    <Text style={styles.historyStatSub}>{formatMs(item.stats.meanAbsMs)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  topBarIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  topBarTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  modeStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  modePill: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: "rgba(255,255,255,0.02)",
    minHeight: 44,
    justifyContent: "center",
  },
  modePillSelected: {
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentSubtle,
  },
  modePillText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  modePillTextSelected: {
    color: Colors.gradientEnd,
  },
  heroCard: {
    marginHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    padding: 14,
    gap: 12,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  heroCopy: {
    flex: 1,
    gap: 4,
  },
  heroTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  heroSubtitle: {
    color: Colors.textTertiary,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_400Regular",
  },
  songBpmBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    minHeight: 40,
  },
  songBpmText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  controlsRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  controlCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: Colors.surfaceGlass,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    padding: 12,
    gap: 10,
  },
  controlCardWide: {
    backgroundColor: Colors.surfaceGlass,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    padding: 12,
    gap: 10,
  },
  controlLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  controlIcon: {
    width: 20,
    height: 20,
  },
  controlLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  controlHint: {
    color: Colors.textTertiary,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Inter_400Regular",
  },
  bpmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  smallBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: "rgba(255,255,255,0.02)",
    alignItems: "center",
    justifyContent: "center",
  },
  bpmInput: {
    flex: 1,
    textAlign: "center",
    color: Colors.textPrimary,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  beatsRow: {
    flexDirection: "row",
    gap: 10,
  },
  beatToggle: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: "rgba(255,255,255,0.02)",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  beatToggleSelected: {
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentSubtle,
  },
  beatToggleText: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  gridRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  gridChip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: "rgba(255,255,255,0.02)",
    minHeight: 44,
    justifyContent: "center",
  },
  gridChipSelected: {
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentSubtle,
  },
  gridChipText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  gridChipTextSelected: {
    color: Colors.gradientEnd,
  },
  trainerCard: {
    marginTop: 12,
    marginHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    padding: 16,
    gap: 12,
  },
  circleWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  circleOuter: {
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.02)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  circleRotator: {
    position: "absolute",
    width: 240,
    height: 240,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  circleDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.gradientStart,
    shadowColor: Colors.gradientStart,
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  circleCenter: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  circleTitle: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
  },
  circleSub: {
    color: Colors.textTertiary,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  primaryAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: Colors.gradientEnd,
    minHeight: 48,
    minWidth: 140,
  },
  primaryActionRecording: {
    backgroundColor: Colors.warningUnderline,
  },
  primaryActionText: {
    color: "#111",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  tapBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    minHeight: 48,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  tapBtnDisabled: {
    opacity: 0.4,
  },
  tapBtnText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  feedbackText: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    minHeight: 22,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    flexWrap: "wrap",
  },
  statPill: {
    backgroundColor: Colors.surfaceGlass,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 100,
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  statLabel: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  consonantCard: {
    marginTop: 4,
    backgroundColor: Colors.surfaceGlass,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    padding: 12,
    gap: 12,
  },
  tapEventCard: {
    marginTop: 4,
    backgroundColor: Colors.surfaceGlass,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    padding: 12,
    gap: 10,
  },
  tapEventTitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  eventList: {
    gap: 8,
  },
  eventRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  eventTime: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    width: 70,
  },
  eventDev: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    flex: 1,
  },
  eventConf: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    width: 54,
    textAlign: "right",
  },
  historyCard: {
    marginTop: 12,
    marginHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    padding: 14,
    gap: 10,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  historyTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  historyEmpty: {
    color: Colors.textTertiary,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_400Regular",
  },
  historyList: {
    gap: 10,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
  },
  historyLeft: {
    flex: 1,
    gap: 3,
  },
  historyRight: {
    alignItems: "flex-end",
    gap: 2,
    minWidth: 86,
  },
  historyLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  historyMeta: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  historyStat: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  historyStatSub: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
});
