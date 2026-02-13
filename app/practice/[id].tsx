import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import CoachPill from '@/components/CoachPill';
import { useApp } from '@/lib/AppContext';

const speedOptions = [0.8, 1.0, 1.1] as const;
const loopLengthOptions = [5, 10, 20] as const;

export default function PracticeLoopScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sessions } = useApp();

  const session = useMemo(() => sessions.find(s => s.id === id), [sessions, id]);

  const [isLooping, setIsLooping] = useState(false);
  const [selectedLineIdx, setSelectedLineIdx] = useState(0);
  const [speed, setSpeed] = useState<number>(1.0);
  const [loopLength, setLoopLength] = useState<number>(10);
  const [loopCount, setLoopCount] = useState(0);
  const [coachHint, setCoachHint] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const progressAnim = useSharedValue(0);
  const loopTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  const lyricsLines = useMemo(() => {
    if (!session?.lyrics) return [];
    return session.lyrics.split('\n').filter(l => l.trim());
  }, [session?.lyrics]);

  useEffect(() => {
    if (isLooping) {
      const interval = 100;
      const totalSteps = (loopLength * 1000) / interval;
      let step = 0;

      loopTimerRef.current = setInterval(() => {
        step++;
        const p = step / totalSteps;
        setProgress(p);
        progressAnim.value = p;

        if (step >= totalSteps) {
          step = 0;
          setLoopCount(c => c + 1);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

          const hints = session?.insights?.topToFix || [];
          if (hints.length > 0) {
            const hint = hints[Math.floor(Math.random() * hints.length)];
            setCoachHint(hint.reason);
            setTimeout(() => setCoachHint(null), 2500);
          }
        }
      }, interval);
    } else {
      if (loopTimerRef.current) clearInterval(loopTimerRef.current);
      setProgress(0);
      progressAnim.value = 0;
    }

    return () => {
      if (loopTimerRef.current) clearInterval(loopTimerRef.current);
    };
  }, [isLooping, loopLength]);

  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    if (isLooping) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      pulseOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [isLooping]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${progressAnim.value * 100}%`,
  }));

  const progressTextStyle = useAnimatedStyle(() => {
    const pct = interpolate(progressAnim.value, [0, 1], [0, 100]);
    return { 
      opacity: progressAnim.value > 0 ? 1 : 0,
      transform: [{ scale: interpolate(pct, [0, 50, 100], [0.8, 1, 1.1]) }],
    };
  });

  if (!session) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Session not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.topBarTitle}>Practice Loop</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.phraseSelector}>
          <Text style={styles.selectorLabel}>Select Phrase</Text>
          <View style={styles.phraseList}>
            {lyricsLines.map((line, idx) => (
              <Pressable
                key={idx}
                style={[
                  styles.phraseLine,
                  selectedLineIdx === idx && styles.phraseLineActive,
                ]}
                onPress={() => {
                  setSelectedLineIdx(idx);
                  Haptics.selectionAsync();
                }}
              >
                <Text
                  style={[
                    styles.phraseText,
                    selectedLineIdx === idx && styles.phraseTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {line}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.selectedPhrase}>
          <Text style={styles.selectedPhraseText}>
            {lyricsLines[selectedLineIdx] || 'No phrase selected'}
          </Text>
          <View style={styles.progressBarContainer}>
            <Animated.View style={[styles.progressBar, progressBarStyle]}>
              <LinearGradient
                colors={[Colors.gradientStart, Colors.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>
          <Animated.Text style={[styles.progressPercent, progressTextStyle]}>
            {Math.round(progress * 100)}%
          </Animated.Text>
          {isLooping && (
            <Text style={styles.loopCounter}>Loop {loopCount + 1}</Text>
          )}
        </View>

        <View style={styles.coachArea}>
          <CoachPill hint={coachHint} visible={!!coachHint} />
        </View>

        <View style={styles.controls}>
          <View style={styles.controlGroup}>
            <Text style={styles.controlLabel}>Loop Length</Text>
            <View style={styles.optionsRow}>
              {loopLengthOptions.map(l => (
                <Pressable
                  key={l}
                  style={[styles.optionBtn, loopLength === l && styles.optionBtnActive]}
                  onPress={() => {
                    setLoopLength(l);
                    Haptics.selectionAsync();
                  }}
                >
                  <Text style={[styles.optionText, loopLength === l && styles.optionTextActive]}>
                    {l}s
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.controlGroup}>
            <View style={styles.controlLabelRow}>
              <Feather name="activity" size={14} color={Colors.textTertiary} />
              <Text style={styles.controlLabel}>Speed</Text>
            </View>
            <View style={styles.optionsRow}>
              {speedOptions.map(s => (
                <Pressable
                  key={s}
                  style={[styles.optionBtn, speed === s && styles.optionBtnActive]}
                  onPress={() => {
                    setSpeed(s);
                    Haptics.selectionAsync();
                  }}
                >
                  <Text style={[styles.optionText, speed === s && styles.optionTextActive]}>
                    {s}x
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </View>

      <View style={[styles.bottomAction, { paddingBottom: Math.max(insets.bottom, webBottomInset) + 16 }]}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setIsLooping(!isLooping);
            if (!isLooping) setLoopCount(0);
          }}
          style={styles.loopPressable}
        >
          <Animated.View style={isLooping ? pulseStyle : undefined}>
            <LinearGradient
              colors={isLooping
                ? [Colors.dangerUnderline, '#cc5858']
                : [Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.loopBtn}
            >
              <Ionicons name={isLooping ? 'stop' : 'repeat'} size={20} color="#fff" />
              <Text style={styles.loopBtnText}>
                {isLooping ? 'Stop Loop' : 'Start Loop'}
              </Text>
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  topBarTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundText: {
    color: Colors.textTertiary,
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 24,
  },
  phraseSelector: {
    gap: 8,
  },
  selectorLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  phraseList: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    maxHeight: 180,
    overflow: 'hidden',
  },
  phraseLine: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderGlass,
  },
  phraseLineActive: {
    backgroundColor: Colors.accentSubtle,
    borderLeftWidth: 3,
    borderLeftColor: Colors.gradientStart,
  },
  phraseText: {
    color: Colors.textTertiary,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  phraseTextActive: {
    color: Colors.textPrimary,
    fontFamily: 'Inter_500Medium',
  },
  selectedPhrase: {
    backgroundColor: Colors.surfaceGlassLyrics,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    gap: 12,
  },
  selectedPhraseText: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
    lineHeight: 32,
  },
  progressBarContainer: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
    overflow: 'hidden',
  },
  loopCounter: {
    color: Colors.textTertiary,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  coachArea: {
    minHeight: 40,
    alignItems: 'center',
  },
  controls: {
    gap: 20,
  },
  controlGroup: {
    gap: 8,
  },
  controlLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  optionBtnActive: {
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentSubtle,
  },
  optionText: {
    color: Colors.textTertiary,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  optionTextActive: {
    color: Colors.gradientStart,
    fontFamily: 'Inter_600SemiBold',
  },
  bottomAction: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  loopPressable: {
    borderRadius: 14,
    overflow: 'hidden',
    boxShadow: `0px 4px 12px ${Colors.accentGlow}`,
    elevation: 6,
  },
  loopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  loopBtnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  controlLabelRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  progressPercent: {
    color: Colors.gradientStart,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
});
