import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import Colors from '@/constants/colors';

interface VUMeterProps {
  isActive: boolean;
  barCount?: number;
}

function MeterBar({ index, isActive }: { index: number; isActive: boolean }) {
  const height = useSharedValue(4);

  useEffect(() => {
    if (isActive) {
      const baseDelay = index * 40;
      const minH = 4 + Math.random() * 6;
      const maxH = 12 + Math.random() * 20;
      const dur = 250 + Math.random() * 300;

      height.value = withDelay(
        baseDelay,
        withRepeat(
          withSequence(
            withTiming(maxH, { duration: dur, easing: Easing.inOut(Easing.ease) }),
            withTiming(minH, { duration: dur * 0.8, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        )
      );
    } else {
      height.value = withTiming(4, { duration: 300 });
    }
  }, [isActive]);

  const barStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  const isCenter = index >= 6 && index <= 13;
  const barColor = isCenter ? Colors.gradientMid : Colors.gradientStart;

  return (
    <Animated.View
      style={[
        styles.bar,
        barStyle,
        { backgroundColor: barColor, opacity: isActive ? 0.7 : 0.2 },
      ]}
    />
  );
}

export default function VUMeter({ isActive, barCount = 20 }: VUMeterProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: barCount }, (_, i) => (
        <MeterBar key={i} index={i} isActive={isActive} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    height: 36,
  },
  bar: {
    width: 3,
    borderRadius: 1.5,
    minHeight: 4,
  },
});
