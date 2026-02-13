import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import Colors from '@/constants/colors';
import type { LyricLine, WordState } from '@/lib/types';

interface LiveLyricsCanvasProps {
  lines: LyricLine[];
  activeLineIndex: number;
}

function AnimatedWord({ text, state }: { text: string; state: WordState }) {
  const underlineWidth = useSharedValue(0);
  const underlineOpacity = useSharedValue(0);

  const getUnderlineColor = () => {
    switch (state) {
      case 'confirmed': return Colors.successUnderline;
      case 'mismatch': return Colors.dangerUnderline;
      case 'unclear': return Colors.unclearText;
      case 'active': return Colors.gradientMid;
      default: return 'transparent';
    }
  };

  const getTextOpacity = () => {
    switch (state) {
      case 'upcoming': return 0.4;
      case 'active': return 1;
      case 'confirmed': return 0.88;
      case 'unclear': return 0.5;
      case 'mismatch': return 0.82;
      default: return 0.4;
    }
  };

  const showUnderline = state !== 'upcoming';
  const isActive = state === 'active';
  const isDotted = state === 'unclear';

  useEffect(() => {
    if (showUnderline) {
      underlineOpacity.value = withTiming(1, { duration: 120, easing: Easing.out(Easing.ease) });
      underlineWidth.value = withDelay(
        30,
        withTiming(isDotted ? 0.6 : 1, { duration: 150, easing: Easing.out(Easing.ease) })
      );
    } else {
      underlineOpacity.value = withTiming(0, { duration: 80 });
      underlineWidth.value = withTiming(0, { duration: 80 });
    }
  }, [state, showUnderline, isDotted]);

  const underlineAnim = useAnimatedStyle(() => ({
    opacity: underlineOpacity.value,
    width: `${underlineWidth.value * 100}%`,
  }));

  return (
    <View style={styles.wordContainer}>
      <Text
        style={[
          styles.word,
          {
            opacity: getTextOpacity(),
            fontFamily: isActive ? 'Inter_600SemiBold' : 'Inter_500Medium',
            fontSize: isActive ? 30 : 28,
          },
        ]}
      >
        {text}
      </Text>
      <Animated.View
        style={[
          styles.underline,
          { backgroundColor: getUnderlineColor() },
          underlineAnim,
        ]}
      />
    </View>
  );
}

function AnimatedLine({ line, isActive }: { line: LyricLine; isActive: boolean }) {
  const opacity = useSharedValue(isActive ? 1 : 0.7);
  const scale = useSharedValue(isActive ? 1 : 0.96);

  useEffect(() => {
    opacity.value = withTiming(isActive ? 1 : 0.7, { duration: 200 });
    scale.value = withTiming(isActive ? 1 : 0.96, { duration: 200 });
  }, [isActive]);

  const lineAnim = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.lineContainer, isActive && styles.activeLineContainer, lineAnim]}>
      {isActive && <View style={styles.nowGuide} />}
      <View style={styles.wordsRow}>
        {line.words.map(word => (
          <AnimatedWord key={word.id} text={word.text} state={word.state} />
        ))}
      </View>
    </Animated.View>
  );
}

export default function LiveLyricsCanvas({ lines, activeLineIndex }: LiveLyricsCanvasProps) {
  const visibleStart = Math.max(0, activeLineIndex - 1);
  const visibleEnd = Math.min(lines.length, activeLineIndex + 3);
  const visibleLines = lines.slice(visibleStart, visibleEnd);

  return (
    <View style={styles.canvas}>
      {visibleLines.map((line, idx) => {
        const globalIdx = visibleStart + idx;
        return (
          <AnimatedLine
            key={line.id}
            line={line}
            isActive={globalIdx === activeLineIndex}
          />
        );
      })}
      {lines.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Add lyrics to get started</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    backgroundColor: Colors.surfaceGlassLyrics,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 20,
    minHeight: 200,
    justifyContent: 'center',
    gap: 14,
  },
  lineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  activeLineContainer: {
    paddingLeft: 8,
  },
  nowGuide: {
    width: 2.5,
    height: '100%',
    backgroundColor: Colors.gradientStart,
    borderRadius: 1.5,
    marginRight: 10,
    opacity: 0.5,
  },
  wordsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
  },
  wordContainer: {
    alignItems: 'center',
  },
  word: {
    color: Colors.textPrimary,
    lineHeight: 40,
    letterSpacing: 0.3,
  },
  underline: {
    height: 2.5,
    borderRadius: 1.5,
    marginTop: 1,
    alignSelf: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: Colors.textTertiary,
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
});
