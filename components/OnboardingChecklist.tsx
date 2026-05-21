import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

export type ChecklistStep = {
  id: string;
  label: string;
  done: boolean;
  onPress?: () => void;
};

type Props = {
  steps: ChecklistStep[];
  onDismiss: () => void;
  title?: string;
  subtitleFormatter?: (done: number, total: number) => string;
};

export function OnboardingChecklist({ steps, onDismiss, title, subtitleFormatter }: Props) {
  const doneCount = steps.filter((s) => s.done).length;
  const total = steps.length;
  const progress = total === 0 ? 0 : doneCount / total;

  if (doneCount === total) {
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>{title ?? 'Kom i gang'}</Text>
          <Text style={styles.subtitle}>
            {subtitleFormatter ? subtitleFormatter(doneCount, total) : `${doneCount} av ${total} steg fullført`}
          </Text>
        </View>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Skjul onboarding"
          hitSlop={12}
          style={styles.dismissButton}
        >
          <Ionicons name="close" size={18} color={Colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.progressTrack}>
        <LinearGradient
          colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd] as const}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.progressFill, { width: `${progress * 100}%` }]}
        />
      </View>

      <View style={styles.steps}>
        {steps.map((step) => (
          <ChecklistRow key={step.id} step={step} />
        ))}
      </View>
    </View>
  );
}

function ChecklistRow({ step }: { step: ChecklistStep }) {
  const isInteractive = !step.done && typeof step.onPress === 'function';
  return (
    <Pressable
      onPress={isInteractive ? step.onPress : undefined}
      disabled={!isInteractive}
      accessibilityRole={isInteractive ? 'button' : 'text'}
      style={({ pressed }) => [
        styles.row,
        pressed && isInteractive && styles.rowPressed,
      ]}
    >
      <View style={[styles.checkCircle, step.done && styles.checkCircleDone]}>
        {step.done ? (
          <Ionicons name="checkmark" size={14} color="#fff" />
        ) : null}
      </View>
      <Text style={[styles.rowText, step.done && styles.rowTextDone]}>
        {step.label}
      </Text>
      {isInteractive ? (
        <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 12,
    zIndex: 50,
    elevation: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    color: Colors.textPrimary,
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  subtitle: {
    color: Colors.textTertiary,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 2,
  },
  dismissButton: {
    padding: 4,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  steps: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  rowPressed: {
    opacity: 0.7,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleDone: {
    backgroundColor: Colors.successUnderline,
    borderColor: Colors.successUnderline,
  },
  rowText: {
    flex: 1,
    color: Colors.textPrimary,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  rowTextDone: {
    color: Colors.textTertiary,
    textDecorationLine: 'line-through',
  },
});
