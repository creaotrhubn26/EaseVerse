import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import type { SongSection } from '@/lib/types';

interface SectionCardProps {
  section: SongSection;
  index: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

const sectionColors: Record<string, string> = {
  verse: Colors.gradientStart,
  chorus: Colors.successUnderline,
  bridge: Colors.warningUnderline,
  intro: Colors.textSecondary,
  outro: Colors.textSecondary,
};

export default function SectionCard({ section, index, onMoveUp, onMoveDown, isFirst, isLast }: SectionCardProps) {
  const color = sectionColors[section.type] || Colors.textSecondary;
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.typeBadge, { borderColor: color + '50' }]}>
          <View style={[styles.typeDot, { backgroundColor: color }]} />
          <Text style={[styles.typeLabel, { color }]}>{section.label}</Text>
        </View>
        <View style={styles.arrows}>
          <Pressable onPress={onMoveUp} disabled={isFirst} hitSlop={8}>
            <Ionicons name="chevron-up" size={18} color={isFirst ? Colors.textTertiary : Colors.textSecondary} />
          </Pressable>
          <Pressable onPress={onMoveDown} disabled={isLast} hitSlop={8}>
            <Ionicons name="chevron-down" size={18} color={isLast ? Colors.textTertiary : Colors.textSecondary} />
          </Pressable>
        </View>
      </View>
      <View style={styles.lines}>
        {section.lines.map((line, i) => (
          <Text key={i} style={styles.lineText} numberOfLines={1}>{line}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  typeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  typeLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'capitalize',
  },
  arrows: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  lines: {
    gap: 3,
  },
  lineText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
});
