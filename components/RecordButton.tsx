import React, { useEffect } from 'react';
import { useAssets } from 'expo-asset';
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

interface RecordButtonProps {
  isRecording: boolean;
  isPaused: boolean;
  onPress: () => void;
  size?: number;
  iconSource?: ImageSourcePropType;
}

export default function RecordButton({
  isRecording,
  isPaused,
  onPress,
  size = 80,
  iconSource = require('@/assets/images/sing-record-v1.png'),
}: RecordButtonProps) {
  useAssets([require('@/assets/images/sing-pause-v1.png'), require('@/assets/images/sing-resume-v1.png')]);
  const pulseAnim = useSharedValue(0);
  const pressScale = useSharedValue(1);
  const touchPulseAnim = useSharedValue(0);
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
    opacity: interpolate(pulseAnim.value, [0, 1], [0, 0.6]),
    transform: [{ scale: interpolate(pulseAnim.value, [0, 1], [1, 1.25]) }],
  }));

  const touchPulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(touchPulseAnim.value, [0, 1], [0, 0.5]),
    transform: [{ scale: interpolate(touchPulseAnim.value, [0, 1], [1, 1.4]) }],
  }));

  const handlePressIn = () => {
    touchPulseAnim.value = withSequence(
      withTiming(1, { duration: 140, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 300, easing: Easing.in(Easing.cubic) }),
    );
  };

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
      <Animated.View
        style={[
          styles.pulseRing,
          { width: size + 28, height: size + 28, borderRadius: (size + 28) / 2, pointerEvents: 'none' as const },
          touchPulseStyle,
        ]}
      />
      <Animated.View style={buttonScale}>
        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          style={[styles.pressable, { borderRadius: size / 2 }, !isRecording && styles.pressableIdle]}
          testID="record-button"
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          accessibilityState={{ busy: isRecording && !isPaused }}
        >
          {!isRecording ? (
            <Image
              source={iconSource}
              style={[
                styles.recordButtonImage,
                { width: size, height: size, borderRadius: Math.round(size * 0.26) },
              ]}
              resizeMode="contain"
              accessible={false}
            />
          ) : (
            <View style={[styles.button, { width: size, height: size, borderRadius: size / 2 }]}>
              <Image source={isPaused
                ? require('@/assets/images/sing-resume-v1.png')
                : require('@/assets/images/sing-pause-v1.png')}
                style={{width: size * 0.66, height: size * 0.66}} resizeMode="contain" accessible={false} />
            </View>
          )}
        </Pressable>
      </Animated.View>
      <Text style={styles.caption}>{!isRecording ? 'Record' : isPaused ? 'Resume' : 'Pause'}</Text>
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
  pressableIdle: {
    boxShadow: 'none',
    elevation: 0,
  },
  caption: { position: 'absolute', bottom: -1, color: Colors.textSecondary, fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  button: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButtonImage: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
});
