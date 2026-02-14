import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

interface RecordButtonProps {
  isRecording: boolean;
  isPaused: boolean;
  onPress: () => void;
  size?: number;
}

export default function RecordButton({ isRecording, isPaused, onPress, size = 80 }: RecordButtonProps) {
  const pulseAnim = useSharedValue(0);
  const pressScale = useSharedValue(1);
  const accessibilityLabel = !isRecording
    ? 'Start recording'
    : isPaused
      ? 'Resume recording'
      : 'Pause recording';
  const accessibilityHint = !isRecording
    ? 'Starts live singing analysis'
    : isPaused
      ? 'Resumes recording and live analysis'
      : 'Pauses recording and live analysis';

  useEffect(() => {
    if (isRecording && !isPaused) {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1250, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 1250, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      pulseAnim.value = withTiming(0, { duration: 300 });
    }
  }, [isRecording, isPaused, pulseAnim]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulseAnim.value, [0, 1], [0.2, 0.6]),
    transform: [{ scale: interpolate(pulseAnim.value, [0, 1], [1, 1.25]) }],
  }));

  const buttonScale = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    pressScale.value = withSequence(
      withTiming(0.92, { duration: 80 }),
      withTiming(1, { duration: 120 })
    );
    onPress();
  };

  return (
    <View style={[styles.container, { width: size + 32, height: size + 32 }]}>
      <Animated.View
        style={[
          styles.pulseRing,
          { width: size + 28, height: size + 28, borderRadius: (size + 28) / 2, pointerEvents: 'none' as const },
          pulseStyle,
        ]}
      />
      <Animated.View style={buttonScale}>
        <Pressable
          onPress={handlePress}
          style={styles.pressable}
          testID="record-button"
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          accessibilityState={{ busy: isRecording && !isPaused }}
        >
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.button, { width: size, height: size, borderRadius: size / 2 }]}
          >
            {isRecording && !isPaused ? (
              <Ionicons name="pause" size={size * 0.4} color="#fff" />
            ) : isPaused ? (
              <Ionicons name="play" size={size * 0.4} color="#fff" style={{ marginLeft: 4 }} />
            ) : (
              <View style={[styles.innerCircle, { width: size * 0.35, height: size * 0.35, borderRadius: size * 0.175 }]} />
            )}
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    backgroundColor: Colors.accentGlow,
  },
  pressable: {
    boxShadow: `0px 4px 16px ${Colors.accentGlow}`,
    elevation: 8,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerCircle: {
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
});
