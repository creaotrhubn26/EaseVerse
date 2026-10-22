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
  isListening?: boolean;
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
      case 'upcoming': return 0.82;
      case 'active': return 1;
      case 'confirmed': return 0.88;
      case 'unclear': return 0.5;
      case 'mismatch': return 0.82;
      default: return 0.82;
    }
  };

  const showUnderline = state !== 'upcoming';
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
  }, [state, showUnderline, isDotted, underlineOpacity, underlineWidth]);

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
            fontFamily: 'Inter_500Medium',
            fontSize: 25,
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
  const text = line.words.map(word => word.text).join(' ');
  if (/^\[.+\]$/.test(text.trim())) {
    return <Text style={styles.sectionLabel}>{text.trim().slice(1, -1)}</Text>;
  }
  return (
    <View style={styles.lineContainer} accessible accessibilityLabel={text}>
      {isActive && <View style={styles.nowGuide} />}
      <View style={styles.wordsRow}>
        {line.words.map(word => (
          <AnimatedWord key={word.id} text={word.text} state={word.state} />
        ))}
      </View>
    </View>
  );
}

export default function LiveLyricsCanvas({ lines, activeLineIndex, isListening = false }: LiveLyricsCanvasProps) {
  const hasActiveLine = isListening && activeLineIndex >= 0;
  const visibleStart = hasActiveLine ? Math.max(0, activeLineIndex - 1) : 0;
  const visibleEnd = hasActiveLine ? Math.min(lines.length, activeLineIndex + 3) : lines.length;
  const visibleLines = lines.slice(visibleStart, visibleEnd);

  return (
    <View style={styles.canvas} testID="sing-lyrics-canvas">
      {visibleLines.map((line, idx) => {
        const globalIdx = visibleStart + idx;
        return (
          <AnimatedLine
            key={line.id}
            line={isListening ? line : { ...line, words: line.words.map(word => ({ ...word, state: 'upcoming' as const })) }}
            isActive={hasActiveLine && globalIdx === activeLineIndex}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    backgroundColor: Colors.surfaceGlassLyrics,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 18,
    minHeight: 160,
    justifyContent: 'center',
    gap: 14,
  },
  sectionLabel: { color: Colors.gradientMid, fontSize: 12, lineHeight: 18, letterSpacing: 1.2,
    fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', paddingLeft: 12 },
  lineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingLeft: 12,
  },
  nowGuide: {
    width: 2.5,
    height: '100%',
    backgroundColor: Colors.gradientStart,
    borderRadius: 1.5,
    position: 'absolute',
    left: 0,
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
    lineHeight: 36,
    letterSpacing: 0.3,
  },
  underline: {
    height: 2.5,
    borderRadius: 1.5,
    marginTop: 1,
    alignSelf: 'center',
  },
});
