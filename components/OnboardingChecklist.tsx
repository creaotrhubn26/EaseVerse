import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
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
  collapsible?: boolean;
};

export function OnboardingChecklist({ steps, onDismiss, title, subtitleFormatter, collapsible = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const doneCount = steps.filter((s) => s.done).length;
  const total = steps.length;
  const progress = total === 0 ? 0 : doneCount / total;

  if (doneCount === total) {
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Pressable style={styles.headerTextWrap} disabled={!collapsible}
          accessibilityRole={collapsible ? 'button' : undefined}
          accessibilityLabel={collapsible ? 'Practice setup' : undefined}
          accessibilityState={collapsible ? { expanded } : undefined}
          aria-expanded={collapsible ? expanded : undefined}
          {...(Platform.OS === 'web' && collapsible ? {
            onKeyDown: (event: React.KeyboardEvent) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setExpanded(value => !value);
              }
            },
          } : {})}
          onPress={() => setExpanded(value => !value)}>
          <Text style={styles.title}>{title ?? (collapsible ? 'Practice setup' : 'Get started')}</Text>
          <Text style={styles.subtitle}>
            {subtitleFormatter ? subtitleFormatter(doneCount, total) : `${doneCount} of ${total} steps completed`}
          </Text>
          {collapsible && <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textTertiary} />}
        </Pressable>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss onboarding"
          hitSlop={12}
          style={styles.dismissButton}
        >
          <Ionicons name="close" size={18} color={Colors.textSecondary} />
        </Pressable>
      </View>

      {(!collapsible || expanded) && <><View style={styles.progressTrack}>
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
      </View></>}
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
    minHeight: 44,
    justifyContent: 'center',
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
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
