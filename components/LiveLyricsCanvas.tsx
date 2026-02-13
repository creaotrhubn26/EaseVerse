import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Colors from '@/constants/colors';
import type { LyricLine, WordState } from '@/lib/types';

interface LiveLyricsCanvasProps {
  lines: LyricLine[];
  activeLineIndex: number;
}

function WordView({ text, state }: { text: string; state: WordState }) {
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
      case 'upcoming': return 0.45;
      case 'active': return 1;
      case 'confirmed': return 0.9;
      case 'unclear': return 0.55;
      case 'mismatch': return 0.85;
      default: return 0.45;
    }
  };

  const underlineColor = getUnderlineColor();
  const isActive = state === 'active';
  const isDotted = state === 'unclear';

  return (
    <View style={styles.wordContainer}>
      <Text
        style={[
          styles.word,
          {
            opacity: getTextOpacity(),
            fontFamily: isActive ? 'Inter_600SemiBold' : 'Inter_500Medium',
          },
        ]}
      >
        {text}
      </Text>
      {underlineColor !== 'transparent' && (
        <View
          style={[
            styles.underline,
            {
              backgroundColor: underlineColor,
              ...(isDotted ? { width: '60%' } : {}),
            },
          ]}
        />
      )}
    </View>
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
        const isActiveLine = globalIdx === activeLineIndex;
        return (
          <View
            key={line.id}
            style={[
              styles.lineContainer,
              isActiveLine && styles.activeLineContainer,
            ]}
          >
            {isActiveLine && <View style={styles.nowGuide} />}
            <View style={styles.wordsRow}>
              {line.words.map(word => (
                <WordView key={word.id} text={word.text} state={word.state} />
              ))}
            </View>
          </View>
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
    paddingVertical: 24,
    paddingHorizontal: 20,
    minHeight: 200,
    justifyContent: 'center',
    gap: 16,
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
    width: 2,
    height: '100%',
    backgroundColor: Colors.gradientStart,
    borderRadius: 1,
    marginRight: 10,
    opacity: 0.4,
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
    fontSize: 28,
    lineHeight: 38,
    letterSpacing: 0.3,
  },
  underline: {
    height: 2,
    width: '100%',
    borderRadius: 1,
    marginTop: 2,
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
