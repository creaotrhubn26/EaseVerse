import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

type Tip = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
};

const TIPS: Tip[] = [
  { icon: 'body-outline', text: 'Stand or sit tall — spine long, shoulders relaxed' },
  { icon: 'happy-outline', text: 'Soft jaw, slight smile — no clenching' },
  { icon: 'leaf-outline', text: 'Breathe into the belly, not the chest' },
  { icon: 'hand-left-outline', text: 'Shake out wrists, neck, and roll shoulders 3x' },
  { icon: 'water-outline', text: 'Room-temperature water within reach' },
];

type Props = {
  onDismiss: () => void;
};

export function PostureReminder({ onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Hide posture tips' : 'Show posture tips'}
        accessibilityState={{ expanded }}
      >
        <Ionicons name="body" size={18} color={Colors.gradientMid} />
        <Text style={styles.title}>Before you sing — posture check</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={Colors.textSecondary}
        />
      </Pressable>
      {expanded ? (
        <View style={styles.tipList}>
          {TIPS.map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <Ionicons name={tip.icon} size={14} color={Colors.gradientMid} />
              <Text style={styles.tipText}>{tip.text}</Text>
            </View>
          ))}
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Got it"
            style={styles.dismissBtn}
          >
            <Text style={styles.dismissText}>Got it</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    color: Colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  tipList: {
    gap: 6,
    marginTop: 6,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  tipText: {
    flex: 1,
    color: Colors.textSecondary,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 16,
  },
  dismissBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.surfaceGlass,
  },
  dismissText: {
    color: Colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
});
