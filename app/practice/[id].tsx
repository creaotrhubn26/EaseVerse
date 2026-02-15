import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  ActivityIndicator,
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
import { usePronunciationCoach } from '@/lib/usePronunciationCoach';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { getApiHeaders, getApiUrl } from '@/lib/query-client';

const speedOptions = [0.8, 1.0, 1.1] as const;
const loopLengthOptions = [5, 10, 20] as const;

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Failed to convert audio blob to data URI'));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read audio blob'));
    reader.readAsDataURL(blob);
  });
}

export default function PracticeLoopScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sessions, settings } = useApp();

  const session = useMemo(() => sessions.find(s => s.id === id), [sessions, id]);

  const [isLooping, setIsLooping] = useState(false);
  const [selectedLineIdx, setSelectedLineIdx] = useState(0);
  const [speed, setSpeed] = useState<number>(1.0);
  const [loopLength, setLoopLength] = useState<number>(10);
  const [loopCount, setLoopCount] = useState(0);
  const [coachHint, setCoachHint] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [loopAudioUri, setLoopAudioUri] = useState<string | null>(null);
  const [loopAudioLine, setLoopAudioLine] = useState('');
  const [isLoopAudioLoading, setIsLoopAudioLoading] = useState(false);
  const [loopAudioError, setLoopAudioError] = useState<string | null>(null);
  const coach = usePronunciationCoach();
  const loopPlayer = useAudioPlayer(loopAudioUri ? { uri: loopAudioUri } : null);
  const loopPlayerStatus = useAudioPlayerStatus(loopPlayer);

  const progressAnim = useSharedValue(0);
  const loopTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const coachHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopEndAtRef = useRef<number | null>(null);
  const loopHintIndexRef = useRef(0);

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  const lyricsLines = useMemo(() => {
    if (!session?.lyrics) return [];
    return session.lyrics.split('\n').filter(l => l.trim());
  }, [session?.lyrics]);

  useEffect(() => {
    setIsLooping((current) => (current ? false : current));
    setLoopAudioError(null);
  }, [selectedLineIdx]);

  const ensureLoopAudio = useCallback(async (): Promise<boolean> => {
    const line = lyricsLines[selectedLineIdx];
    if (!line) {
      setLoopAudioError('Select a phrase to start looping.');
      return false;
    }

    if (loopAudioUri && loopAudioLine === line) {
      return true;
    }

    try {
      setIsLoopAudioLoading(true);
      setLoopAudioError(null);
      const baseUrl = getApiUrl();
      const elevenUrl = new URL('/api/tts/elevenlabs', baseUrl);
      const fallbackUrl = new URL('/api/tts', baseUrl);

      let response: Response | null = null;
      try {
        response = await fetch(elevenUrl.toString(), {
          method: 'POST',
          headers: getApiHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ text: line, voice: settings.narrationVoice }),
        });
      } catch {
        response = null;
      }

      if (!response || !response.ok) {
        response = await fetch(fallbackUrl.toString(), {
          method: 'POST',
          headers: getApiHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ text: line, voice: 'nova' }),
        });
      }
      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.status}`);
      }

      const blob = await response.blob();
      const dataUri = await blobToDataUri(blob);
      setLoopAudioUri(dataUri);
      setLoopAudioLine(line);
      return true;
    } catch (error) {
      console.error('Failed to prepare practice loop audio:', error);
      setLoopAudioError('Unable to generate loop audio. Check TTS API configuration.');
      return false;
    } finally {
      setIsLoopAudioLoading(false);
    }
  }, [loopAudioLine, loopAudioUri, lyricsLines, selectedLineIdx]);

  useEffect(() => {
    if (!isLooping) {
      if (loopTimerRef.current) clearInterval(loopTimerRef.current);
      loopEndAtRef.current = null;
      if (coachHintTimeoutRef.current) {
        clearTimeout(coachHintTimeoutRef.current);
        coachHintTimeoutRef.current = null;
      }
      setCoachHint(null);
      try {
        loopPlayer.pause();
        loopPlayer.seekTo(0);
      } catch {
        // Ignore pause/seek errors when player is not ready.
      }
      setProgress(0);
      progressAnim.value = 0;
      return;
    }

    const totalMs = loopLength * 1000;
    loopEndAtRef.current = Date.now() + totalMs;
    loopTimerRef.current = setInterval(() => {
      const endAt = loopEndAtRef.current;
      if (!endAt) {
        return;
      }
      const remainingMs = Math.max(0, endAt - Date.now());
      const nextProgress = 1 - remainingMs / totalMs;
      setProgress(nextProgress);
      progressAnim.value = nextProgress;
      if (remainingMs <= 0) {
        setIsLooping(false);
      }
    }, 80);

    return () => {
      if (loopTimerRef.current) clearInterval(loopTimerRef.current);
    };
  }, [isLooping, loopLength, loopPlayer, progressAnim]);

  useEffect(() => {
    if (!isLooping) {
      return;
    }

    if (loopPlayerStatus.didJustFinish) {
      const endAt = loopEndAtRef.current;
      if (endAt && Date.now() < endAt) {
        setLoopCount((count) => count + 1);
        const hints = session?.insights?.topToFix || [];
        if (hints.length > 0) {
          const hint = hints[loopHintIndexRef.current % hints.length];
          loopHintIndexRef.current += 1;
          setCoachHint(hint.reason);
          if (coachHintTimeoutRef.current) {
            clearTimeout(coachHintTimeoutRef.current);
          }
          coachHintTimeoutRef.current = setTimeout(() => setCoachHint(null), 2500);
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        try {
          loopPlayer.seekTo(0);
          loopPlayer.play();
        } catch {
          setIsLooping(false);
        }
      } else {
        setIsLooping(false);
      }
    }
  }, [isLooping, loopPlayer, loopPlayerStatus.didJustFinish, session?.insights?.topToFix]);

  useEffect(() => {
    if (!isLoopAudioLoading && loopAudioUri) {
      try {
        loopPlayer.setPlaybackRate(speed, 'medium');
      } catch {
        // Ignore playback-rate errors on unsupported platforms.
      }
    }
  }, [isLoopAudioLoading, loopAudioUri, loopPlayer, speed]);

  useEffect(() => {
    return () => {
      if (loopTimerRef.current) clearInterval(loopTimerRef.current);
      if (coachHintTimeoutRef.current) {
        clearTimeout(coachHintTimeoutRef.current);
        coachHintTimeoutRef.current = null;
      }
      try {
        loopPlayer.pause();
      } catch {
        // Ignore pause errors on unmount.
      }
    };
  }, [loopPlayer]);

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
  }, [isLooping, pulseOpacity]);

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
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityHint="Returns to the previous screen"
          >
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
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to session review"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.topBarTitle} accessibilityRole="header">Practice Loop</Text>
        <View style={{ width: 44 }} />
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
                accessibilityRole="button"
                accessibilityLabel={`Select phrase ${idx + 1}`}
                accessibilityHint={line}
                accessibilityState={{ selected: selectedLineIdx === idx }}
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
          <Pressable
            style={styles.pronounceBtn}
            onPress={() => {
              const line = lyricsLines[selectedLineIdx];
              if (!line) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const words = line.split(' ').filter((w: string) => w.trim());
              const hardWord = words.reduce((longest: string, w: string) => w.length > longest.length ? w : longest, '');
              coach.pronounce(hardWord, line);
            }}
            accessibilityRole="button"
            accessibilityLabel="Hear pronunciation"
            accessibilityHint="Plays pronunciation guidance for the selected phrase"
          >
            {coach.state === 'loading' ? (
              <ActivityIndicator size="small" color={Colors.gradientStart} />
            ) : (
              <Ionicons name="volume-high-outline" size={18} color={Colors.gradientStart} />
            )}
            <Text style={styles.pronounceBtnText}>
              {coach.state === 'playing' ? 'Speaking...' : 'Hear pronunciation'}
            </Text>
          </Pressable>
          {coach.result && (
            <View style={styles.pronounceResult}>
              <Text style={styles.pronouncePhonetic}>{coach.result.phonetic}</Text>
              <Text style={styles.pronounceTip}>{coach.result.tip}</Text>
            </View>
          )}
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
                  accessibilityRole="button"
                  accessibilityLabel={`Set loop length to ${l} seconds`}
                  accessibilityState={{ selected: loopLength === l }}
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
                  accessibilityRole="button"
                  accessibilityLabel={`Set speed to ${s}x`}
                  accessibilityState={{ selected: speed === s }}
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
          onPress={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            if (isLoopAudioLoading) {
              return;
            }

            if (isLooping) {
              setIsLooping(false);
              return;
            }

            const ready = await ensureLoopAudio();
            if (!ready) {
              return;
            }

            setLoopAudioError(null);
            setLoopCount(0);
            loopHintIndexRef.current = 0;
            setCoachHint(null);
            setIsLooping(true);
            try {
              loopPlayer.seekTo(0);
              loopPlayer.setPlaybackRate(speed, 'medium');
              loopPlayer.play();
            } catch {
              setIsLooping(false);
              setLoopAudioError('Unable to start loop playback on this device.');
            }
          }}
          style={styles.loopPressable}
          disabled={isLoopAudioLoading}
          accessibilityRole="button"
          accessibilityLabel={isLooping ? 'Stop practice loop' : isLoopAudioLoading ? 'Preparing practice loop audio' : 'Start practice loop'}
          accessibilityHint="Toggles repeated playback for the selected phrase"
          accessibilityState={{ disabled: isLoopAudioLoading }}
        >
          <Animated.View style={isLooping ? pulseStyle : undefined}>
            <LinearGradient
              colors={isLoopAudioLoading
                ? [Colors.surface, Colors.surface]
                : isLooping
                ? [Colors.dangerUnderline, '#cc5858']
                : [Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.loopBtn}
            >
              {isLoopAudioLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name={isLooping ? 'stop' : 'repeat'} size={20} color="#fff" />
              )}
              <Text style={styles.loopBtnText}>
                {isLoopAudioLoading ? 'Preparing Audio...' : isLooping ? 'Stop Loop' : 'Start Loop'}
              </Text>
            </LinearGradient>
          </Animated.View>
        </Pressable>
        {loopAudioError && (
          <Text style={styles.loopErrorText}>{loopAudioError}</Text>
        )}
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
  backButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
    minHeight: 44,
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
    minHeight: 44,
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
    gap: 8,
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
  loopErrorText: {
    color: Colors.dangerUnderline,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: 'Inter_500Medium',
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
  pronounceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: Colors.accentSubtle,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
  },
  pronounceBtnText: {
    color: Colors.gradientStart,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  pronounceResult: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
  },
  pronouncePhonetic: {
    color: Colors.gradientEnd,
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  pronounceTip: {
    color: Colors.textTertiary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
});
