import React, { useState } from 'react';
import { StyleSheet, View, PanResponder, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

interface WaveformTimelineProps {
  progress: number;
  barCount?: number;
  duration?: number;
  interactive?: boolean;
  onSeek?: (progress: number) => void;
}

export default function WaveformTimeline({
  progress,
  barCount = 60,
  duration = 0,
  interactive = false,
  onSeek,
}: WaveformTimelineProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrubProgress, setScrubProgress] = useState<number | null>(null);

  const displayProgress = scrubProgress !== null ? scrubProgress : progress;

  const bars = Array.from({ length: barCount }, (_, i) => {
    const seed = Math.sin(i * 1.5 + 0.7) * 0.5 + 0.5;
    const height = 8 + seed * 32;
    const isPast = i / barCount <= displayProgress;
    return { height, isPast };
  });

  const panResponder = interactive
    ? PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          if (containerWidth > 0) {
            const p = Math.max(0, Math.min(1, evt.nativeEvent.locationX / containerWidth));
            setScrubProgress(p);
            Haptics.selectionAsync();
          }
        },
        onPanResponderMove: (evt) => {
          if (containerWidth > 0) {
            const p = Math.max(0, Math.min(1, evt.nativeEvent.locationX / containerWidth));
            setScrubProgress(p);
          }
        },
        onPanResponderRelease: () => {
          if (scrubProgress !== null && onSeek) {
            onSeek(scrubProgress);
          }
          setScrubProgress(null);
        },
      })
    : undefined;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.wrapper}>
      <View
        style={styles.container}
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        {...(panResponder ? panResponder.panHandlers : {})}
      >
        {bars.map((bar, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              {
                height: bar.height,
                backgroundColor: bar.isPast ? Colors.gradientMid : 'rgba(255,255,255,0.1)',
              },
            ]}
          />
        ))}
        {interactive && containerWidth > 0 && (
          <View
            style={[
              styles.scrubberLine,
              { left: displayProgress * containerWidth },
            ]}
          >
            <View style={styles.scrubberDot} />
          </View>
        )}
      </View>
      {duration > 0 && (
        <View style={styles.timeLabels}>
          <Text style={styles.timeLabel}>
            {formatTime(displayProgress * duration)}
          </Text>
          <Text style={styles.timeLabel}>{formatTime(duration)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 48,
    paddingHorizontal: 4,
    position: 'relative',
  },
  bar: {
    flex: 1,
    borderRadius: 1.5,
    minWidth: 2,
  },
  scrubberLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: Colors.gradientStart,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrubberDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.gradientStart,
    borderWidth: 2,
    borderColor: '#fff',
  },
  timeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeLabel: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
});
