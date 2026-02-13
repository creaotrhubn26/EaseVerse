import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import {
  warmUpExercises,
  voiceSafetyRules,
  getEstimatedDuration,
  type WarmUpExercise,
  type WarmUpTip,
} from '@/constants/warmup';

type WarmUpPhase = 'intro' | 'exercise' | 'complete';

function TipCard({ tip }: { tip: WarmUpTip }) {
  const isDo = tip.type === 'do';
  return (
    <View style={[styles.tipCard, isDo ? styles.tipDo : styles.tipDont]}>
      <Ionicons
        name={isDo ? 'checkmark-circle' : 'close-circle'}
        size={18}
        color={isDo ? '#4ADE80' : '#F87171'}
      />
      <Text style={[styles.tipText, isDo ? styles.tipTextDo : styles.tipTextDont]}>
        {tip.text}
      </Text>
    </View>
  );
}

function ExerciseTimer({ exercise, onComplete, onSkip }: {
  exercise: WarmUpExercise;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(exercise.durationSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [showTips, setShowTips] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    setTimeLeft(exercise.durationSeconds);
    setIsRunning(false);
    setShowTips(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, [exercise.id]);

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            setIsRunning(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  useEffect(() => {
    if (isRunning) {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      pulseAnim.value = withTiming(1, { duration: 300 });
    }
  }, [isRunning]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const progress = 1 - (timeLeft / exercise.durationSeconds);
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const handleStartPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsRunning(!isRunning);
    if (!isRunning) setShowTips(false);
  };

  return (
    <View style={styles.timerContainer}>
      <Animated.View style={[styles.timerCircle, pulseStyle]}>
        <View style={[styles.timerProgress, { borderColor: `${exercise.categoryColor}30` }]}>
          <View style={[
            styles.timerProgressFill,
            {
              borderColor: exercise.categoryColor,
              borderTopColor: progress > 0.25 ? exercise.categoryColor : 'transparent',
              borderRightColor: progress > 0.5 ? exercise.categoryColor : 'transparent',
              borderBottomColor: progress > 0.75 ? exercise.categoryColor : 'transparent',
              borderLeftColor: progress > 0 ? exercise.categoryColor : 'transparent',
              transform: [{ rotate: `${progress * 360}deg` }],
            },
          ]} />
        </View>
        <Text style={styles.timerText}>{timeString}</Text>
        <Text style={[styles.timerLabel, { color: exercise.categoryColor }]}>
          {isRunning ? 'In Progress' : timeLeft === 0 ? 'Done' : 'Ready'}
        </Text>
      </Animated.View>

      <View style={styles.timerButtons}>
        {timeLeft === 0 ? (
          <Pressable onPress={onComplete} style={styles.timerMainBtn}>
            <LinearGradient
              colors={[Colors.gradientStart, Colors.gradientMid]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.timerMainBtnGradient}
            >
              <Ionicons name="checkmark" size={24} color="#fff" />
              <Text style={styles.timerMainBtnText}>Next Exercise</Text>
            </LinearGradient>
          </Pressable>
        ) : (
          <Pressable onPress={handleStartPause} style={styles.timerMainBtn}>
            <LinearGradient
              colors={isRunning ? ['#F87171', '#EF4444'] : [Colors.gradientStart, Colors.gradientMid]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.timerMainBtnGradient}
            >
              <Ionicons name={isRunning ? 'pause' : 'play'} size={22} color="#fff" />
              <Text style={styles.timerMainBtnText}>
                {isRunning ? 'Pause' : 'Start'}
              </Text>
            </LinearGradient>
          </Pressable>
        )}
        <Pressable onPress={onSkip} style={styles.skipBtn}>
          <Feather name="skip-forward" size={18} color={Colors.textSecondary} />
          <Text style={styles.skipBtnText}>Skip</Text>
        </Pressable>
      </View>

      {showTips && !isRunning && timeLeft > 0 && (
        <View style={styles.instructionBox}>
          <View style={styles.instructionHeader}>
            <Ionicons name="information-circle" size={18} color={exercise.categoryColor} />
            <Text style={styles.instructionTitle}>How to do it</Text>
          </View>
          {exercise.howTo.map((step, i) => (
            <View key={i} style={styles.howToStep}>
              <View style={[styles.stepDot, { backgroundColor: exercise.categoryColor }]}>
                <Text style={styles.stepNumber}>{i + 1}</Text>
              </View>
              <Text style={styles.howToText}>{step}</Text>
            </View>
          ))}
        </View>
      )}

      {(isRunning || timeLeft === 0) && (
        <View style={styles.instructionBox}>
          <Text style={[styles.activeInstruction, { color: exercise.categoryColor }]}>
            {exercise.instruction}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function WarmUpScreen() {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<WarmUpPhase>('intro');
  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [completedExercises, setCompletedExercises] = useState<Set<string>>(new Set());
  const scrollRef = useRef<ScrollView>(null);

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const totalMinutes = Math.ceil(getEstimatedDuration() / 60);
  const currentExercise = warmUpExercises[currentExIdx];

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (phase === 'exercise' && currentExIdx > 0) {
      setCurrentExIdx(prev => prev - 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } else if (phase === 'exercise' && currentExIdx === 0) {
      setPhase('intro');
    } else {
      router.back();
    }
  };

  const handleStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase('exercise');
    setCurrentExIdx(0);
  };

  const handleExerciseComplete = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCompletedExercises(prev => new Set([...prev, warmUpExercises[currentExIdx].id]));
    if (currentExIdx < warmUpExercises.length - 1) {
      setCurrentExIdx(prev => prev + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } else {
      setPhase('complete');
    }
  }, [currentExIdx]);

  const handleSkip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentExIdx < warmUpExercises.length - 1) {
      setCurrentExIdx(prev => prev + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } else {
      setPhase('complete');
    }
  }, [currentExIdx]);

  if (phase === 'intro') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Vocal Warm-Up</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.introHero}>
            <View style={styles.heroIconWrap}>
              <LinearGradient
                colors={[Colors.gradientStart, Colors.gradientEnd]}
                style={styles.heroIconGradient}
              >
                <Ionicons name="fitness" size={36} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.introTitle}>Protect Your Voice</Text>
            <Text style={styles.introSubtitle}>
              {warmUpExercises.length} exercises  ~{totalMinutes} min
            </Text>
            <Text style={styles.introDescription}>
              Warming up is like stretching before a workout. It prevents injury, 
              improves your range, and helps you sound your best.
            </Text>
          </View>

          <View style={styles.safetySection}>
            <Text style={styles.sectionTitle}>Voice Safety Rules</Text>
            {voiceSafetyRules.map((rule, i) => (
              <View key={i} style={[
                styles.safetyCard,
                rule.type === 'danger' && styles.safetyDanger,
                rule.type === 'warning' && styles.safetyWarning,
              ]}>
                <View style={styles.safetyIconWrap}>
                  <Ionicons
                    name={rule.icon as any}
                    size={20}
                    color={
                      rule.type === 'danger' ? '#F87171' :
                      rule.type === 'warning' ? '#FBBF24' :
                      '#60A5FA'
                    }
                  />
                </View>
                <View style={styles.safetyText}>
                  <Text style={styles.safetyTitle}>{rule.title}</Text>
                  <Text style={styles.safetyDesc}>{rule.description}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.exercisePreview}>
            <Text style={styles.sectionTitle}>Today's Routine</Text>
            {warmUpExercises.map((ex, i) => (
              <View key={ex.id} style={styles.previewItem}>
                <View style={[styles.previewNumber, { backgroundColor: ex.categoryColor + '25' }]}>
                  <Text style={[styles.previewNumberText, { color: ex.categoryColor }]}>{i + 1}</Text>
                </View>
                <View style={styles.previewInfo}>
                  <Text style={styles.previewTitle}>{ex.title}</Text>
                  <View style={styles.previewMeta}>
                    <Text style={[styles.previewCategory, { color: ex.categoryColor }]}>{ex.categoryLabel}</Text>
                    <View style={styles.previewDot} />
                    <Text style={styles.previewDuration}>{Math.ceil(ex.durationSeconds / 60)} min</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={[styles.bottomAction, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 0) + 20 }]}>
          <Pressable onPress={handleStart} style={styles.startPressable}>
            <LinearGradient
              colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.startBtn}
            >
              <Ionicons name="play" size={22} color="#fff" />
              <Text style={styles.startBtnText}>Begin Warm-Up</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  if (phase === 'complete') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.header}>
          <View style={{ width: 24 }} />
          <Text style={styles.headerTitle}>All Done</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.completeContainer}>
          <View style={styles.completeIconWrap}>
            <LinearGradient
              colors={['#4ADE80', '#22C55E']}
              style={styles.completeIconGradient}
            >
              <Ionicons name="checkmark" size={48} color="#fff" />
            </LinearGradient>
          </View>
          <Text style={styles.completeTitle}>Voice Warmed Up</Text>
          <Text style={styles.completeSubtitle}>
            You completed {completedExercises.size} of {warmUpExercises.length} exercises.
            Your voice is ready to perform!
          </Text>

          <View style={styles.completeTips}>
            <View style={styles.completeTipCard}>
              <Ionicons name="water" size={20} color="#60A5FA" />
              <Text style={styles.completeTipText}>Take a sip of room-temp water</Text>
            </View>
            <View style={styles.completeTipCard}>
              <Ionicons name="timer" size={20} color={Colors.gradientStart} />
              <Text style={styles.completeTipText}>You're good to sing for the next 1-2 hours</Text>
            </View>
            <View style={styles.completeTipCard}>
              <Ionicons name="snow" size={20} color="#A78BFA" />
              <Text style={styles.completeTipText}>Remember to cool down after singing</Text>
            </View>
          </View>

          <Pressable onPress={() => router.back()} style={styles.donePresssable}>
            <LinearGradient
              colors={[Colors.gradientStart, Colors.gradientMid]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.doneBtn}
            >
              <Ionicons name="mic" size={22} color="#fff" />
              <Text style={styles.doneBtnText}>Ready to Sing</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerStep}>
            {currentExIdx + 1} / {warmUpExercises.length}
          </Text>
          <View style={styles.progressBar}>
            {warmUpExercises.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.progressDot,
                  i < currentExIdx && styles.progressDotDone,
                  i === currentExIdx && styles.progressDotActive,
                ]}
              />
            ))}
          </View>
        </View>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={Colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scrollContent}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.exerciseHeader}>
          <View style={[styles.categoryBadge, { backgroundColor: currentExercise.categoryColor + '20', borderColor: currentExercise.categoryColor + '40' }]}>
            <Text style={[styles.categoryBadgeText, { color: currentExercise.categoryColor }]}>
              {currentExercise.categoryLabel}
            </Text>
          </View>
          <Text style={styles.exerciseTitle}>{currentExercise.title}</Text>
          <Text style={styles.exerciseSubtitle}>{currentExercise.subtitle}</Text>
        </View>

        <ExerciseTimer
          exercise={currentExercise}
          onComplete={handleExerciseComplete}
          onSkip={handleSkip}
        />

        <View style={styles.tipsSection}>
          <View style={styles.tipsHeader}>
            <Ionicons name="checkmark-circle" size={18} color="#4ADE80" />
            <Text style={styles.tipsTitle}>Do</Text>
          </View>
          {currentExercise.tips.filter(t => t.type === 'do').map((tip, i) => (
            <TipCard key={i} tip={tip} />
          ))}
        </View>

        <View style={styles.tipsSection}>
          <View style={styles.tipsHeader}>
            <Ionicons name="close-circle" size={18} color="#F87171" />
            <Text style={styles.tipsTitleDont}>Don't</Text>
          </View>
          {currentExercise.tips.filter(t => t.type === 'dont').map((tip, i) => (
            <TipCard key={i} tip={tip} />
          ))}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
  },
  headerCenter: {
    alignItems: 'center',
    gap: 6,
  },
  headerStep: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  progressBar: {
    flexDirection: 'row',
    gap: 4,
  },
  progressDot: {
    width: 20,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  progressDotDone: {
    backgroundColor: '#4ADE80',
  },
  progressDotActive: {
    backgroundColor: Colors.gradientStart,
    width: 28,
  },
  scrollContent: {
    flex: 1,
  },
  introHero: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    gap: 12,
  },
  heroIconWrap: {
    marginBottom: 8,
  },
  heroIconGradient: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitle: {
    color: Colors.textPrimary,
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  introSubtitle: {
    color: Colors.gradientStart,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
  },
  introDescription: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 10,
  },
  safetySection: {
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 24,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 4,
  },
  safetyCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  safetyDanger: {
    borderColor: 'rgba(248,113,113,0.2)',
    backgroundColor: 'rgba(248,113,113,0.05)',
  },
  safetyWarning: {
    borderColor: 'rgba(251,191,36,0.2)',
    backgroundColor: 'rgba(251,191,36,0.05)',
  },
  safetyIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  safetyText: {
    flex: 1,
    gap: 3,
  },
  safetyTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  safetyDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 19,
  },
  exercisePreview: {
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 24,
  },
  previewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  previewNumber: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewNumberText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  previewInfo: {
    flex: 1,
    gap: 3,
  },
  previewTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  previewMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewCategory: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  previewDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.textTertiary,
  },
  previewDuration: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  bottomAction: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: Colors.background,
  },
  startPressable: {
    borderRadius: 14,
    overflow: 'hidden',
    boxShadow: `0px 4px 12px ${Colors.accentGlow}`,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  startBtnText: {
    color: '#fff',
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
  },
  exerciseHeader: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 8,
  },
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  exerciseTitle: {
    color: Colors.textPrimary,
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  exerciseSubtitle: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  timerContainer: {
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 20,
    marginBottom: 24,
  },
  timerCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.borderGlass,
  },
  timerProgress: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 4,
  },
  timerProgressFill: {
    position: 'absolute',
    width: 152,
    height: 152,
    borderRadius: 76,
    borderWidth: 4,
  },
  timerText: {
    color: Colors.textPrimary,
    fontSize: 36,
    fontFamily: 'Inter_700Bold',
  },
  timerLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 2,
  },
  timerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    width: '100%',
  },
  timerMainBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  timerMainBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  timerMainBtnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  skipBtnText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  instructionBox: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    width: '100%',
    gap: 12,
  },
  instructionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  instructionTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  howToStep: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumber: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },
  howToText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    flex: 1,
    lineHeight: 20,
  },
  activeInstruction: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    lineHeight: 22,
    textAlign: 'center',
  },
  tipsSection: {
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 20,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  tipsTitle: {
    color: '#4ADE80',
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  tipsTitleDont: {
    color: '#F87171',
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  tipDo: {
    backgroundColor: 'rgba(74,222,128,0.06)',
    borderColor: 'rgba(74,222,128,0.15)',
  },
  tipDont: {
    backgroundColor: 'rgba(248,113,113,0.06)',
    borderColor: 'rgba(248,113,113,0.15)',
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
  tipTextDo: {
    color: '#86EFAC',
  },
  tipTextDont: {
    color: '#FCA5A5',
  },
  completeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 16,
  },
  completeIconWrap: {
    marginBottom: 8,
  },
  completeIconGradient: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeTitle: {
    color: Colors.textPrimary,
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  completeSubtitle: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
  completeTips: {
    gap: 10,
    marginTop: 12,
    marginBottom: 24,
    width: '100%',
  },
  completeTipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  completeTipText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  donePresssable: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  doneBtnText: {
    color: '#fff',
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
  },
});
