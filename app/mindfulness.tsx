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
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useNarration } from '@/lib/useNarration';
import AudioModule from 'expo-audio/build/AudioModule';
import Colors from '@/constants/colors';
import {
  moodOptions,
  breathingPatterns,
  energyTechniques,
  visualizations,
  affirmations,
  getRecommendedBreathing,
  getRecommendedTechniques,
  getAffirmationsForMood,
  getRecommendedVisualization,
  type MoodLevel,
  type BreathingPattern,
  type EnergyTechnique,
  type VisualizationExercise,
} from '@/constants/mindfulness';

type MindfulnessPhase = 'mood' | 'plan' | 'breathing' | 'technique' | 'visualization' | 'affirmation' | 'complete';

function BreathingGuide({ pattern, onComplete, speak }: { pattern: BreathingPattern; onComplete: () => void; speak: (text: string, onDone?: () => void) => Promise<void> }) {
  const [currentCycle, setCurrentCycle] = useState(0);
  const [phase, setPhase] = useState<'inhale' | 'hold' | 'exhale' | 'holdAfter'>('inhale');
  const [countdown, setCountdown] = useState(pattern.inhale);
  const [isActive, setIsActive] = useState(false);

  const circleScale = useSharedValue(0.6);
  const circleOpacity = useSharedValue(0.4);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getPhaseLabel = useCallback(() => {
    switch (phase) {
      case 'inhale': return 'Breathe In';
      case 'hold': return 'Hold';
      case 'exhale': return 'Breathe Out';
      case 'holdAfter': return 'Hold';
    }
  }, [phase]);

  const getPhaseColor = useCallback(() => {
    switch (phase) {
      case 'inhale': return '#3B82F6';
      case 'hold': return '#8B5CF6';
      case 'exhale': return '#10B981';
      case 'holdAfter': return '#F59E0B';
    }
  }, [phase]);

  useEffect(() => {
    if (!isActive) return;

    if (phase === 'inhale') {
      circleScale.value = withTiming(1.0, { duration: pattern.inhale * 1000, easing: Easing.inOut(Easing.ease) });
      circleOpacity.value = withTiming(0.8, { duration: pattern.inhale * 1000 });
      speak('Breathe in deeply').catch(() => {});
    } else if (phase === 'hold' || phase === 'holdAfter') {
      speak('Hold gently').catch(() => {});
    } else if (phase === 'exhale') {
      circleScale.value = withTiming(0.6, { duration: pattern.exhale * 1000, easing: Easing.inOut(Easing.ease) });
      circleOpacity.value = withTiming(0.4, { duration: pattern.exhale * 1000 });
      speak('Slowly breathe out').catch(() => {});
    }
  }, [phase, isActive, pattern.inhale, pattern.exhale, circleScale, circleOpacity, speak]);

  useEffect(() => {
    if (!isActive) return;

    const phaseDurations: Record<string, number> = {
      inhale: pattern.inhale,
      hold: pattern.hold,
      exhale: pattern.exhale,
      holdAfter: pattern.holdAfter,
    };

    setCountdown(phaseDurations[phase]);

    const countdownInterval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    timerRef.current = setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (phase === 'inhale') {
        if (pattern.hold > 0) setPhase('hold');
        else setPhase('exhale');
      } else if (phase === 'hold') {
        setPhase('exhale');
      } else if (phase === 'exhale') {
        if (pattern.holdAfter > 0) setPhase('holdAfter');
        else {
          if (currentCycle + 1 >= pattern.cycles) {
            setIsActive(false);
            onComplete();
          } else {
            setCurrentCycle(c => c + 1);
            setPhase('inhale');
          }
        }
      } else if (phase === 'holdAfter') {
        if (currentCycle + 1 >= pattern.cycles) {
          setIsActive(false);
          onComplete();
        } else {
          setCurrentCycle(c => c + 1);
          setPhase('inhale');
        }
      }
    }, phaseDurations[phase] * 1000);

    return () => {
      clearInterval(countdownInterval);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, isActive, currentCycle, pattern, onComplete]);

  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: circleScale.value }],
    opacity: circleOpacity.value,
  }));

  return (
    <View style={styles.breathingContainer}>
      <Text style={styles.breathingTitle}>{pattern.title}</Text>
      <Text style={styles.breathingSubtitle}>{pattern.description}</Text>

      <View style={styles.breathCircleContainer}>
        <Animated.View style={[styles.breathCircle, { borderColor: getPhaseColor() }, circleStyle]}>
          <Text style={[styles.breathPhaseLabel, { color: getPhaseColor() }]}>
            {isActive ? getPhaseLabel() : 'Ready'}
          </Text>
          <Text style={[styles.breathCountdown, { color: getPhaseColor() }]}>
            {isActive ? countdown : ''}
          </Text>
        </Animated.View>
      </View>

      <Text style={styles.cycleCounter}>
        {isActive ? `Cycle ${currentCycle + 1} of ${pattern.cycles}` : `${pattern.cycles} cycles`}
      </Text>

      <View style={styles.breathPatternInfo}>
        <View style={styles.breathPhaseInfo}>
          <Text style={styles.breathPhaseNum}>{pattern.inhale}s</Text>
          <Text style={styles.breathPhaseDesc}>In</Text>
        </View>
        {pattern.hold > 0 && (
          <View style={styles.breathPhaseInfo}>
            <Text style={styles.breathPhaseNum}>{pattern.hold}s</Text>
            <Text style={styles.breathPhaseDesc}>Hold</Text>
          </View>
        )}
        <View style={styles.breathPhaseInfo}>
          <Text style={styles.breathPhaseNum}>{pattern.exhale}s</Text>
          <Text style={styles.breathPhaseDesc}>Out</Text>
        </View>
        {pattern.holdAfter > 0 && (
          <View style={styles.breathPhaseInfo}>
            <Text style={styles.breathPhaseNum}>{pattern.holdAfter}s</Text>
            <Text style={styles.breathPhaseDesc}>Hold</Text>
          </View>
        )}
      </View>

      {!isActive ? (
        <Pressable
          style={styles.startBreathBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            speak(pattern.description).catch(() => {});
            setIsActive(true);
            setCurrentCycle(0);
            setPhase('inhale');
          }}
        >
          <LinearGradient
            colors={[pattern.color, pattern.color + '99']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.startBreathGradient}
          >
            <Ionicons name="play" size={18} color="#fff" />
            <Text style={styles.startBreathText}>Begin</Text>
          </LinearGradient>
        </Pressable>
      ) : (
        <Pressable
          style={styles.skipBreathBtn}
          onPress={() => {
            setIsActive(false);
            onComplete();
          }}
        >
          <Text style={styles.skipBreathText}>Skip</Text>
        </Pressable>
      )}
    </View>
  );
}

function TechniqueGuide({ technique, onComplete, speak }: { technique: EnergyTechnique; onComplete: () => void; speak: (text: string, onDone?: () => void) => Promise<void> }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [timeLeft, setTimeLeft] = useState(technique.durationSeconds);
  const [isActive, setIsActive] = useState(false);

  const stepOpacity = useSharedValue(1);

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(interval);
          onComplete();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive, onComplete]);

  useEffect(() => {
    if (!isActive) return;
    speak(technique.steps[0]).catch(() => {});
    const stepDuration = (technique.durationSeconds / technique.steps.length) * 1000;
    const stepInterval = setInterval(() => {
      stepOpacity.value = withSequence(
        withTiming(0, { duration: 200 }),
        withTiming(1, { duration: 300 })
      );
      setCurrentStep(s => {
        const next = s + 1;
        if (next >= technique.steps.length) {
          clearInterval(stepInterval);
          return s;
        }
        speak(technique.steps[next]).catch(() => {});
        return next;
      });
    }, stepDuration);
    return () => clearInterval(stepInterval);
  }, [isActive, technique.steps.length, technique.durationSeconds, stepOpacity, speak, technique.steps]);

  const stepStyle = useAnimatedStyle(() => ({
    opacity: stepOpacity.value,
  }));

  const progressWidth = isActive ? interpolate(timeLeft, [technique.durationSeconds, 0], [100, 0]) : 100;

  return (
    <View style={styles.techniqueContainer}>
      <View style={[styles.techniqueIconCircle, { backgroundColor: technique.color + '20' }]}>
        <Ionicons name={technique.icon} size={28} color={technique.color} />
      </View>
      <Text style={styles.techniqueTitle}>{technique.title}</Text>
      <Text style={styles.techniqueDesc}>{technique.description}</Text>

      {isActive && (
        <View style={styles.techniqueProgress}>
          <View style={styles.techniqueProgressBar}>
            <View style={[styles.techniqueProgressFill, { width: `${progressWidth}%`, backgroundColor: technique.color }]} />
          </View>
          <Text style={styles.techniqueTimer}>{timeLeft}s</Text>
        </View>
      )}

      <Animated.View style={[styles.stepCard, stepStyle]}>
        <View style={styles.stepNumberCircle}>
          <Text style={styles.stepNumber}>{currentStep + 1}</Text>
        </View>
        <Text style={styles.stepText}>{technique.steps[currentStep]}</Text>
      </Animated.View>

      {!isActive && currentStep === 0 && (
        <View style={styles.allStepsPreview}>
          {technique.steps.map((step, i) => (
            <View key={i} style={styles.previewStep}>
              <View style={[styles.previewDot, { backgroundColor: technique.color }]} />
              <Text style={styles.previewStepText}>{step}</Text>
            </View>
          ))}
        </View>
      )}

      {!isActive ? (
        <Pressable
          style={styles.startBreathBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            speak(technique.description).catch(() => {});
            setIsActive(true);
            setCurrentStep(0);
          }}
        >
          <LinearGradient
            colors={[technique.color, technique.color + '99']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.startBreathGradient}
          >
            <Ionicons name="play" size={18} color="#fff" />
            <Text style={styles.startBreathText}>Start</Text>
          </LinearGradient>
        </Pressable>
      ) : (
        <Pressable
          style={styles.skipBreathBtn}
          onPress={() => {
            setIsActive(false);
            onComplete();
          }}
        >
          <Text style={styles.skipBreathText}>Skip</Text>
        </Pressable>
      )}
    </View>
  );
}

function VisualizationGuide({ visualization, onComplete, speak }: { visualization: VisualizationExercise; onComplete: () => void; speak: (text: string, onDone?: () => void) => Promise<void> }) {
  const [currentLine, setCurrentLine] = useState(0);
  const [isActive, setIsActive] = useState(false);

  const lineOpacity = useSharedValue(0);
  const pulseValue = useSharedValue(1);

  useEffect(() => {
    if (!isActive) return;
    pulseValue.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.95, { duration: 3000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    return () => {
      pulseValue.value = withTiming(1, { duration: 200 });
    };
  }, [isActive, pulseValue]);

  useEffect(() => {
    if (!isActive) return;
    lineOpacity.value = withTiming(1, { duration: 600 });
    speak(visualization.narration[0]).catch(() => {});

    const lineDuration = (visualization.durationSeconds / visualization.narration.length) * 1000;
    const lineInterval = setInterval(() => {
      lineOpacity.value = withSequence(
        withTiming(0, { duration: 300 }),
        withTiming(1, { duration: 500 })
      );
      setCurrentLine(l => {
        const next = l + 1;
        if (next >= visualization.narration.length) {
          clearInterval(lineInterval);
          setTimeout(() => onComplete(), 2000);
          return l;
        }
        speak(visualization.narration[next]).catch(() => {});
        return next;
      });
    }, lineDuration);
    return () => clearInterval(lineInterval);
  }, [isActive, visualization.narration.length, visualization.durationSeconds, lineOpacity, onComplete, speak, visualization.narration]);

  const lineStyle = useAnimatedStyle(() => ({
    opacity: lineOpacity.value,
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseValue.value }],
  }));

  return (
    <View style={styles.vizContainer}>
      <Animated.View style={[styles.vizGlowCircle, { borderColor: visualization.color + '40' }, pulseStyle]}>
        <View style={[styles.vizInnerCircle, { backgroundColor: visualization.color + '15' }]}>
          <Ionicons name={visualization.icon} size={36} color={visualization.color} />
        </View>
      </Animated.View>

      <Text style={styles.vizTitle}>{visualization.title}</Text>

      {isActive ? (
        <Animated.View style={[styles.vizNarrationCard, lineStyle]}>
          <Text style={styles.vizNarrationText}>{visualization.narration[currentLine]}</Text>
          <Text style={styles.vizLineCounter}>{currentLine + 1} / {visualization.narration.length}</Text>
        </Animated.View>
      ) : (
        <Text style={styles.vizDescription}>{visualization.bestFor}</Text>
      )}

      {!isActive ? (
        <Pressable
          style={styles.startBreathBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setIsActive(true);
            setCurrentLine(0);
            lineOpacity.value = 0;
          }}
        >
          <LinearGradient
            colors={[visualization.color, visualization.color + '99']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.startBreathGradient}
          >
            <Ionicons name="play" size={18} color="#fff" />
            <Text style={styles.startBreathText}>Begin</Text>
          </LinearGradient>
        </Pressable>
      ) : (
        <Pressable
          style={styles.skipBreathBtn}
          onPress={() => {
            setIsActive(false);
            onComplete();
          }}
        >
          <Text style={styles.skipBreathText}>Skip</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function MindfulnessScreen() {
  const insets = useSafeAreaInsets();
  const narration = useNarration();
  const [currentPhase, setCurrentPhase] = useState<MindfulnessPhase>('mood');
  const [selectedMood, setSelectedMood] = useState<MoodLevel | null>(null);
  const [selectedBreathing, setSelectedBreathing] = useState<BreathingPattern | null>(null);
  const [selectedTechnique, setSelectedTechnique] = useState<EnergyTechnique | null>(null);
  const [selectedViz, setSelectedViz] = useState<VisualizationExercise | null>(null);
  const [currentAffirmation, setCurrentAffirmation] = useState<string>('');
  const [narrationEnabled, setNarrationEnabled] = useState(true);

  const fadeIn = useSharedValue(0);

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  useEffect(() => {
    AudioModule.setAudioModeAsync({
      playsInSilentMode: true,
    });
    return () => { narration.stop(); };
  }, []);

  const narrateIfEnabled = useCallback(async (text: string, onDone?: () => void) => {
    if (narrationEnabled) {
      await narration.speak(text, onDone);
    } else {
      onDone?.();
    }
  }, [narrationEnabled, narration]);

  useEffect(() => {
    fadeIn.value = withTiming(1, { duration: 400 });
  }, [currentPhase, fadeIn]);

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: fadeIn.value,
  }));

  const handleMoodSelect = useCallback((mood: MoodLevel) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedMood(mood);
    setSelectedBreathing(getRecommendedBreathing(mood));
    const techniques = getRecommendedTechniques(mood);
    setSelectedTechnique(techniques[0] || energyTechniques[0]);
    setSelectedViz(getRecommendedVisualization(mood));
    const moodAffirmations = getAffirmationsForMood(mood);
    setCurrentAffirmation(moodAffirmations[Math.floor(Math.random() * moodAffirmations.length)]?.text || affirmations[0].text);
    fadeIn.value = 0;
    setCurrentPhase('plan');
  }, [fadeIn]);

  const goToPhase = useCallback((phase: MindfulnessPhase) => {
    narration.stop();
    fadeIn.value = 0;
    setCurrentPhase(phase);
    Haptics.selectionAsync();
    if (phase === 'affirmation') {
      setTimeout(() => {
        narrateIfEnabled(currentAffirmation).catch(() => {});
      }, 500);
    } else if (phase === 'complete') {
      setTimeout(() => {
        narrateIfEnabled('You are ready. Go make something beautiful.').catch(() => {});
      }, 500);
    }
  }, [fadeIn, narration, narrateIfEnabled, currentAffirmation]);

  const renderMoodPicker = () => (
    <Animated.View style={[styles.phaseContent, fadeStyle]}>
      <View style={styles.phaseHeader}>
        <Ionicons name="heart" size={28} color={Colors.gradientStart} />
        <Text style={styles.phaseTitle}>How are you feeling?</Text>
        <Text style={styles.phaseSubtitle}>Check in with yourself before you sing. Your emotional state shapes your voice.</Text>
      </View>

      <View style={styles.moodGrid}>
        {moodOptions.map(mood => (
          <Pressable
            key={mood.id}
            style={[styles.moodCard, { borderColor: mood.color + '30' }]}
            onPress={() => handleMoodSelect(mood.id)}
          >
            <View style={[styles.moodIconCircle, { backgroundColor: mood.color + '15' }]}>
              <Ionicons name={mood.icon} size={24} color={mood.color} />
            </View>
            <Text style={styles.moodLabel}>{mood.label}</Text>
            <Text style={styles.moodDesc}>{mood.description}</Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );

  const renderPlan = () => {
    const mood = moodOptions.find(m => m.id === selectedMood);
    if (!mood) return null;

    return (
      <Animated.View style={[styles.phaseContent, fadeStyle]}>
        <View style={styles.phaseHeader}>
          <View style={[styles.moodBadge, { backgroundColor: mood.color + '20', borderColor: mood.color + '40' }]}>
            <Ionicons name={mood.icon} size={16} color={mood.color} />
            <Text style={[styles.moodBadgeText, { color: mood.color }]}>{mood.label}</Text>
          </View>
          <Text style={styles.phaseTitle}>Your Mindfulness Plan</Text>
          <Text style={styles.phaseSubtitle}>{mood.suggestion}</Text>
        </View>

        <View style={styles.planCards}>
          <Pressable style={styles.planCard} onPress={() => goToPhase('breathing')}>
            <View style={[styles.planIconCircle, { backgroundColor: (selectedBreathing?.color || '#3B82F6') + '15' }]}>
              <Ionicons name={selectedBreathing?.icon || 'square-outline'} size={22} color={selectedBreathing?.color || '#3B82F6'} />
            </View>
            <View style={styles.planCardText}>
              <Text style={styles.planCardTitle}>Breathing</Text>
              <Text style={styles.planCardDesc}>{selectedBreathing?.title || 'Box Breathing'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
          </Pressable>

          <Pressable style={styles.planCard} onPress={() => goToPhase('technique')}>
            <View style={[styles.planIconCircle, { backgroundColor: (selectedTechnique?.color || '#10B981') + '15' }]}>
              <Ionicons name={selectedTechnique?.icon || 'earth'} size={22} color={selectedTechnique?.color || '#10B981'} />
            </View>
            <View style={styles.planCardText}>
              <Text style={styles.planCardTitle}>Energy Technique</Text>
              <Text style={styles.planCardDesc}>{selectedTechnique?.title || 'Grounding'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
          </Pressable>

          <Pressable style={styles.planCard} onPress={() => goToPhase('visualization')}>
            <View style={[styles.planIconCircle, { backgroundColor: (selectedViz?.color || '#FF7A18') + '15' }]}>
              <Ionicons name={selectedViz?.icon || 'sunny'} size={22} color={selectedViz?.color || '#FF7A18'} />
            </View>
            <View style={styles.planCardText}>
              <Text style={styles.planCardTitle}>Visualization</Text>
              <Text style={styles.planCardDesc}>{selectedViz?.title || 'Golden Light'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
          </Pressable>

          <Pressable style={styles.planCard} onPress={() => goToPhase('affirmation')}>
            <View style={[styles.planIconCircle, { backgroundColor: '#F59E0B15' }]}>
              <Ionicons name="sparkles" size={22} color="#F59E0B" />
            </View>
            <View style={styles.planCardText}>
              <Text style={styles.planCardTitle}>Affirmation</Text>
              <Text style={styles.planCardDesc}>Power words for your mood</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
          </Pressable>
        </View>

        <Pressable
          style={styles.allBreathingBtn}
          onPress={() => goToPhase('breathing')}
        >
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.allBreathingGradient}
          >
            <Text style={styles.allBreathingText}>Start Full Session</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </LinearGradient>
        </Pressable>
      </Animated.View>
    );
  };

  const renderBreathing = () => (
    <Animated.View style={[styles.phaseContent, fadeStyle]}>
      {selectedBreathing && (
        <BreathingGuide
          pattern={selectedBreathing}
          onComplete={() => goToPhase('technique')}
          speak={narrateIfEnabled}
        />
      )}

      <Text style={styles.otherOptionsLabel}>Other Patterns</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.otherOptionsScroll}>
        {breathingPatterns.filter(b => b.id !== selectedBreathing?.id).map(b => (
          <Pressable
            key={b.id}
            style={[styles.otherOptionChip, { borderColor: b.color + '40' }]}
            onPress={() => {
              setSelectedBreathing(b);
              Haptics.selectionAsync();
            }}
          >
            <Ionicons name={b.icon} size={14} color={b.color} />
            <Text style={[styles.otherOptionText, { color: b.color }]}>{b.title}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );

  const renderTechnique = () => (
    <Animated.View style={[styles.phaseContent, fadeStyle]}>
      {selectedTechnique && (
        <TechniqueGuide
          technique={selectedTechnique}
          onComplete={() => goToPhase('visualization')}
          speak={narrateIfEnabled}
        />
      )}

      <Text style={styles.otherOptionsLabel}>Other Techniques</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.otherOptionsScroll}>
        {energyTechniques.filter(t => t.id !== selectedTechnique?.id).map(t => (
          <Pressable
            key={t.id}
            style={[styles.otherOptionChip, { borderColor: t.color + '40' }]}
            onPress={() => {
              setSelectedTechnique(t);
              Haptics.selectionAsync();
            }}
          >
            <Ionicons name={t.icon} size={14} color={t.color} />
            <Text style={[styles.otherOptionText, { color: t.color }]}>{t.title}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );

  const renderVisualization = () => (
    <Animated.View style={[styles.phaseContent, fadeStyle]}>
      {selectedViz && (
        <VisualizationGuide
          visualization={selectedViz}
          onComplete={() => goToPhase('affirmation')}
          speak={narrateIfEnabled}
        />
      )}

      <Text style={styles.otherOptionsLabel}>Other Visualizations</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.otherOptionsScroll}>
        {visualizations.filter(v => v.id !== selectedViz?.id).map(v => (
          <Pressable
            key={v.id}
            style={[styles.otherOptionChip, { borderColor: v.color + '40' }]}
            onPress={() => {
              setSelectedViz(v);
              Haptics.selectionAsync();
            }}
          >
            <Ionicons name={v.icon} size={14} color={v.color} />
            <Text style={[styles.otherOptionText, { color: v.color }]}>{v.title}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );

  const renderAffirmation = () => {
    const moodAffirmations = selectedMood ? getAffirmationsForMood(selectedMood) : affirmations.slice(0, 4);

    return (
      <Animated.View style={[styles.phaseContent, fadeStyle]}>
        <View style={styles.affirmationCard}>
          <Ionicons name="sparkles" size={32} color="#F59E0B" />
          <Text style={styles.affirmationText}>{currentAffirmation}</Text>
          <Text style={styles.affirmationInstruction}>Repeat this to yourself 3 times, slowly and with feeling</Text>
        </View>

        <Pressable
          style={styles.nextAffirmationBtn}
          onPress={() => {
            const next = moodAffirmations[Math.floor(Math.random() * moodAffirmations.length)];
            setCurrentAffirmation(next?.text || affirmations[0].text);
            Haptics.selectionAsync();
          }}
        >
          <Ionicons name="refresh" size={18} color={Colors.gradientStart} />
          <Text style={styles.nextAffirmationText}>Another One</Text>
        </Pressable>

        <Pressable
          style={styles.finishBtn}
          onPress={() => goToPhase('complete')}
        >
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.finishGradient}
          >
            <Text style={styles.finishText}>I Feel Ready</Text>
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
          </LinearGradient>
        </Pressable>
      </Animated.View>
    );
  };

  const renderComplete = () => (
    <Animated.View style={[styles.phaseContent, styles.completeContainer, fadeStyle]}>
      <View style={styles.completeGlow}>
        <Ionicons name="sparkles" size={48} color={Colors.gradientStart} />
      </View>
      <Text style={styles.completeTitle}>You Are Ready</Text>
      <Text style={styles.completeSubtitle}>
        Your mind is focused, your body is relaxed, and your voice is prepared. Go make something beautiful.
      </Text>

      <View style={styles.completeTips}>
        <View style={styles.completeTipRow}>
          <Ionicons name="checkmark-circle" size={16} color={Colors.successUnderline} />
          <Text style={styles.completeTipText}>Carry your calm breathing into your performance</Text>
        </View>
        <View style={styles.completeTipRow}>
          <Ionicons name="checkmark-circle" size={16} color={Colors.successUnderline} />
          <Text style={styles.completeTipText}>If tension returns, take one deep breath before the next phrase</Text>
        </View>
        <View style={styles.completeTipRow}>
          <Ionicons name="checkmark-circle" size={16} color={Colors.successUnderline} />
          <Text style={styles.completeTipText}>Trust your preparation and let your emotions fuel your singing</Text>
        </View>
      </View>

      <Pressable
        style={styles.doneBtn}
        onPress={() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        }}
      >
        <LinearGradient
          colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.doneBtnGradient}
        >
          <Ionicons name="mic" size={20} color="#fff" />
          <Text style={styles.doneBtnText}>Go Sing</Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );

  const getPhaseIndex = () => {
    const phases: MindfulnessPhase[] = ['mood', 'plan', 'breathing', 'technique', 'visualization', 'affirmation', 'complete'];
    return phases.indexOf(currentPhase);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Mindfulness</Text>
        <Pressable
          onPress={() => {
            setNarrationEnabled(prev => !prev);
            if (narrationEnabled) narration.stop();
          }}
          hitSlop={12}
        >
          <Ionicons
            name={narrationEnabled ? "volume-high" : "volume-mute"}
            size={22}
            color={narrationEnabled ? Colors.gradientStart : Colors.textTertiary}
          />
        </Pressable>
      </View>

      {currentPhase !== 'mood' && currentPhase !== 'complete' && (
        <View style={styles.progressDots}>
          {['plan', 'breathing', 'technique', 'visualization', 'affirmation'].map((p, i) => (
            <View
              key={p}
              style={[
                styles.progressDot,
                getPhaseIndex() >= i + 1 && styles.progressDotActive,
                currentPhase === p && styles.progressDotCurrent,
              ]}
            />
          ))}
        </View>
      )}

      <View style={{ flex: 1 }}>
      {narration.state === 'loading' && (
        <View style={styles.narrationLoading}>
          <Ionicons name="mic" size={12} color={Colors.gradientStart} />
          <Text style={styles.narrationLoadingText}>Generating voice...</Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, webBottomInset) + 40 }}
      >
        {currentPhase === 'mood' && renderMoodPicker()}
        {currentPhase === 'plan' && renderPlan()}
        {currentPhase === 'breathing' && renderBreathing()}
        {currentPhase === 'technique' && renderTechnique()}
        {currentPhase === 'visualization' && renderVisualization()}
        {currentPhase === 'affirmation' && renderAffirmation()}
        {currentPhase === 'complete' && renderComplete()}
      </ScrollView>
      </View>
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
    zIndex: 10,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
  },
  progressDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surfaceGlass,
  },
  progressDotActive: {
    backgroundColor: Colors.gradientStart,
  },
  progressDotCurrent: {
    width: 20,
    borderRadius: 4,
    backgroundColor: Colors.gradientMid,
  },
  phaseContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  phaseHeader: {
    alignItems: 'center',
    marginBottom: 24,
    gap: 8,
  },
  phaseTitle: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  phaseSubtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  moodGrid: {
    gap: 10,
  },
  moodCard: {
    backgroundColor: Colors.surfaceGlass,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
  },
  moodIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodLabel: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    flex: 0,
  },
  moodDesc: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  moodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  moodBadgeText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  planCards: {
    gap: 8,
    marginBottom: 20,
  },
  planCard: {
    backgroundColor: Colors.surfaceGlass,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  planIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planCardText: {
    flex: 1,
    gap: 2,
  },
  planCardTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  planCardDesc: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  allBreathingBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  allBreathingGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  allBreathingText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  breathingContainer: {
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  breathingTitle: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  breathingSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 10,
  },
  breathCircleContainer: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  breathCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceGlass,
  },
  breathPhaseLabel: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  breathCountdown: {
    fontSize: 36,
    fontFamily: 'Inter_700Bold',
    marginTop: 4,
  },
  cycleCounter: {
    color: Colors.textTertiary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  breathPatternInfo: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 4,
  },
  breathPhaseInfo: {
    alignItems: 'center',
    gap: 2,
  },
  breathPhaseNum: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  breathPhaseDesc: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  startBreathBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
    width: '100%',
  },
  startBreathGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  startBreathText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  skipBreathBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  skipBreathText: {
    color: Colors.textTertiary,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  otherOptionsLabel: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
  },
  otherOptionsScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  otherOptionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: Colors.surfaceGlass,
  },
  otherOptionText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  techniqueContainer: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  techniqueIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  techniqueTitle: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  techniqueDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 19,
  },
  techniqueProgress: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  techniqueProgressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceGlass,
    overflow: 'hidden',
  },
  techniqueProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  techniqueTimer: {
    color: Colors.textTertiary,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    minWidth: 30,
    textAlign: 'right',
  },
  stepCard: {
    width: '100%',
    backgroundColor: Colors.surfaceGlass,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  stepNumberCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.gradientStart + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    color: Colors.gradientStart,
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  stepText: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
  },
  allStepsPreview: {
    width: '100%',
    gap: 10,
    marginTop: 4,
  },
  previewStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  previewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },
  previewStepText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 19,
  },
  vizContainer: {
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  vizGlowCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vizInnerCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vizTitle: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  vizDescription: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  vizNarrationCard: {
    width: '100%',
    backgroundColor: Colors.surfaceGlass,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    minHeight: 100,
    justifyContent: 'center',
  },
  vizNarrationText: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 26,
  },
  vizLineCounter: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 12,
  },
  affirmationCard: {
    backgroundColor: Colors.surfaceGlass,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: '#F59E0B30',
    marginBottom: 16,
  },
  affirmationText: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
    lineHeight: 30,
  },
  affirmationInstruction: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  nextAffirmationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginBottom: 8,
  },
  nextAffirmationText: {
    color: Colors.gradientStart,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  finishBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  finishGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  finishText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  completeContainer: {
    alignItems: 'center',
    paddingTop: 40,
  },
  completeGlow: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.gradientStart + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  completeTitle: {
    color: Colors.textPrimary,
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    marginBottom: 8,
  },
  completeSubtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  completeTips: {
    width: '100%',
    gap: 12,
    marginBottom: 32,
    backgroundColor: Colors.surfaceGlass,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  completeTipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  completeTipText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 19,
  },
  doneBtn: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  doneBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  doneBtnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  narrationLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
    zIndex: 10,
  },
  narrationLoadingText: {
    color: Colors.gradientStart,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
});
