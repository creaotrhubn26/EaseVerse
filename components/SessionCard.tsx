import React from 'react';
import { StyleSheet, Text, View, Pressable, Platform } from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { getGenreProfile } from '@/constants/genres';
import type { Session } from '@/lib/types';
import { scaledIconSize, useResponsiveLayout } from '@/lib/responsive';

interface SessionCardProps {
  session: Session;
  onPress: () => void;
  onFavorite: () => void;
  onDelete: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 172800000) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getScoreColor(score: number): string {
  if (score >= 85) return Colors.successUnderline;
  if (score >= 70) return Colors.warningUnderline;
  return Colors.dangerUnderline;
}

export default function SessionCard({ session, onPress, onFavorite, onDelete }: SessionCardProps) {
  const responsive = useResponsiveLayout();
  const genreProfile = session.genre ? getGenreProfile(session.genre) : null;
  const formattedDate = formatDate(session.date);
  const formattedDuration = formatDuration(session.duration);
  const primaryIconSize = scaledIconSize(14, responsive);
  const metaIconSize = scaledIconSize(10, responsive);
  const genreIconSize = scaledIconSize(9, responsive);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
      accessibilityLabel={`Open session ${session.title}`}
      accessibilityHint={`Recorded ${formattedDate} for ${formattedDuration}. Accuracy ${session.insights.textAccuracy} percent.`}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{session.title}</Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onFavorite();
            }}
            hitSlop={12}
            style={styles.iconActionButton}
            accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
            accessibilityLabel={session.favorite ? 'Remove favorite' : 'Mark as favorite'}
            accessibilityHint="Saves this session to your flagged list"
            accessibilityState={{ selected: session.favorite }}
          >
            <Ionicons
              name={session.favorite ? 'heart' : 'heart-outline'}
              size={primaryIconSize}
              color={session.favorite ? Colors.dangerUnderline : Colors.textTertiary}
            />
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              onDelete();
            }}
            hitSlop={12}
            style={styles.iconActionButton}
            accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
            accessibilityLabel="Delete session"
            accessibilityHint="Removes this recording from your sessions"
          >
            <Ionicons name="trash-outline" size={primaryIconSize} color={Colors.textTertiary} />
          </Pressable>
        </View>
        <View style={styles.meta}>
          <Text style={styles.metaText}>{formattedDate}</Text>
          <View style={styles.dot} />
          <Feather name="clock" size={metaIconSize} color={Colors.textTertiary} />
          <Text style={styles.metaText}>{formattedDuration}</Text>
        </View>
      </View>

      <View style={styles.chips}>
        {genreProfile && (
          <View style={[styles.genreChip, { backgroundColor: genreProfile.accentColor, borderColor: genreProfile.color }]}>
            <Ionicons name={genreProfile.icon} size={genreIconSize} color={genreProfile.color} />
            <Text style={[styles.genreChipText, { color: genreProfile.color }]}>{genreProfile.label}</Text>
          </View>
        )}
        <View style={[styles.scoreChip, { borderColor: getScoreColor(session.insights.textAccuracy) + '60' }]}>
          <Text style={[styles.scoreText, { color: getScoreColor(session.insights.textAccuracy) }]}>
            {session.insights.textAccuracy}%
          </Text>
        </View>
        {session.tags.map(tag => (
          <View key={tag} style={styles.tagChip}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 12,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  header: {
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconActionButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
    marginRight: 12,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    color: Colors.textTertiary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.textTertiary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  genreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  genreChipText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  scoreChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  scoreText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  tagChip: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  tagText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
});
