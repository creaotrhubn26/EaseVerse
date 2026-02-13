import React from 'react';
import { StyleSheet, View } from 'react-native';
import Colors from '@/constants/colors';

interface WaveformTimelineProps {
  progress: number;
  barCount?: number;
}

export default function WaveformTimeline({ progress, barCount = 60 }: WaveformTimelineProps) {
  const bars = Array.from({ length: barCount }, (_, i) => {
    const seed = Math.sin(i * 1.5 + 0.7) * 0.5 + 0.5;
    const height = 8 + seed * 32;
    const isPast = i / barCount <= progress;
    return { height, isPast };
  });

  return (
    <View style={styles.container}>
      {bars.map((bar, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            {
              height: bar.height,
              backgroundColor: bar.isPast ? Colors.gradientMid : 'rgba(255,255,255,0.12)',
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 44,
    paddingHorizontal: 4,
  },
  bar: {
    flex: 1,
    borderRadius: 1.5,
    minWidth: 2,
  },
});
