import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Colors from '@/constants/colors';

interface VUMeterProps {
  isActive: boolean;
  audioLevel?: number;
  barCount?: number;
}

function MeterBar({ index, isActive, audioLevel, totalBars }: { index: number; isActive: boolean; audioLevel: number; totalBars: number }) {
  const height = useSharedValue(4);

  useEffect(() => {
    if (isActive && audioLevel > 0) {
      const center = totalBars / 2;
      const distFromCenter = Math.abs(index - center) / center;
      const falloff = 1 - distFromCenter * 0.6;
      const jitter = 0.85 + Math.random() * 0.3;
      const barLevel = audioLevel * falloff * jitter;
      const targetH = 4 + barLevel * 28;
      height.value = withTiming(targetH, { duration: 80, easing: Easing.out(Easing.ease) });
    } else {
      height.value = withTiming(4, { duration: 200 });
    }
  }, [isActive, audioLevel]);

  const barStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  const isCenter = index >= Math.floor(totalBars * 0.3) && index <= Math.floor(totalBars * 0.7);
  const barColor = isCenter ? Colors.gradientMid : Colors.gradientStart;

  return (
    <Animated.View
      style={[
        styles.bar,
        barStyle,
        { backgroundColor: barColor, opacity: isActive && audioLevel > 0.05 ? 0.8 : 0.2 },
      ]}
    />
  );
}

export default function VUMeter({ isActive, audioLevel = 0, barCount = 20 }: VUMeterProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: barCount }, (_, i) => (
        <MeterBar key={i} index={i} isActive={isActive} audioLevel={audioLevel} totalBars={barCount} />
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
