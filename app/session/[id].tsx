import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import WaveformTimeline from '@/components/WaveformTimeline';
import { useApp } from '@/lib/AppContext';

function InsightCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.insightCard}>
      <Text style={[styles.insightValue, { color }]}>{value}</Text>
      <Text style={styles.insightLabel}>{label}</Text>
    </View>
  );
}

function FixItem({ word, reason, index }: { word: string; reason: string; index: number }) {
  return (
    <View style={styles.fixItem}>
      <View style={styles.fixIndex}>
        <Text style={styles.fixIndexText}>{index + 1}</Text>
      </View>
      <View style={styles.fixContent}>
        <Text style={styles.fixWord}>{word}</Text>
        <Text style={styles.fixReason}>{reason}</Text>
      </View>
      <Feather name="chevron-right" size={16} color={Colors.textTertiary} />
    </View>
  );
}

export default function SessionReviewScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sessions } = useApp();

  const session = useMemo(() => sessions.find(s => s.id === id), [sessions, id]);

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  if (!session) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Session not found</Text>
        </View>
      </View>
    );
  }

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getAccuracyColor = (v: number) => {
    if (v >= 85) return Colors.successUnderline;
    if (v >= 70) return Colors.warningUnderline;
    return Colors.dangerUnderline;
  };

  const getTimingLabel = (t: string) => {
    switch (t) {
      case 'high': return 'Consistent';
      case 'medium': return 'Moderate';
      default: return 'Needs work';
    }
  };

  const getTimingColor = (t: string) => {
    switch (t) {
      case 'high': return Colors.successUnderline;
      case 'medium': return Colors.warningUnderline;
      default: return Colors.dangerUnderline;
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.topBarTitle} numberOfLines={1}>Session Review</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, webBottomInset) + 100 }}
      >
        <View style={styles.sessionHeader}>
          <Text style={styles.sessionTitle}>{session.title}</Text>
          <View style={styles.sessionMeta}>
            <Text style={styles.metaText}>{formatDate(session.date)}</Text>
            <View style={styles.dot} />
            <Text style={styles.metaText}>{formatDuration(session.duration)}</Text>
          </View>
        </View>

        <View style={styles.waveformSection}>
          <WaveformTimeline
            progress={1}
            barCount={70}
            duration={session.duration}
            interactive
            onSeek={(p) => {}}
          />
        </View>

        <View style={styles.insightsRow}>
          <InsightCard
            label="Text Accuracy"
            value={`${session.insights.textAccuracy}%`}
            color={getAccuracyColor(session.insights.textAccuracy)}
          />
          <InsightCard
            label="Pronunciation"
            value={`${session.insights.pronunciationClarity}%`}
            color={getAccuracyColor(session.insights.pronunciationClarity)}
          />
          <InsightCard
            label="Timing"
            value={getTimingLabel(session.insights.timingConsistency)}
            color={getTimingColor(session.insights.timingConsistency)}
          />
        </View>

        <View style={styles.fixSection}>
          <Text style={styles.fixSectionTitle}>Top to Fix</Text>
          <View style={styles.fixList}>
            {session.insights.topToFix.map((item, i) => (
              <FixItem key={i} word={item.word} reason={item.reason} index={i} />
            ))}
          </View>
        </View>

        {session.lyrics && (
          <View style={styles.lyricsSection}>
            <Text style={styles.fixSectionTitle}>Lyrics</Text>
            <View style={styles.lyricsCard}>
              <Text style={styles.lyricsText}>{session.lyrics}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomAction, { paddingBottom: Math.max(insets.bottom, webBottomInset) + 16 }]}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push({ pathname: '/practice/[id]', params: { id: session.id } });
          }}
          style={styles.practicePressable}
        >
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.practiceBtn}
          >
            <Ionicons name="repeat" size={20} color="#fff" />
            <Text style={styles.practiceBtnText}>Practice Loop</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  topBarTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
    textAlign: 'center',
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundText: {
    color: Colors.textTertiary,
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
  sessionHeader: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 4,
  },
  sessionTitle: {
    color: Colors.textPrimary,
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
  },
  sessionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    color: Colors.textTertiary,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.textTertiary,
  },
  waveformSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 4,
  },
  insightsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 24,
  },
  insightCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  insightValue: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  insightLabel: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
  },
  fixSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 10,
  },
  fixSectionTitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  fixList: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    overflow: 'hidden',
  },
  fixItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderGlass,
    gap: 12,
  },
  fixIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fixIndexText: {
    color: Colors.gradientStart,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  fixContent: {
    flex: 1,
    gap: 2,
  },
  fixWord: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  fixReason: {
    color: Colors.textTertiary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  lyricsSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 10,
  },
  lyricsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  lyricsText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    lineHeight: 24,
  },
  bottomAction: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: Colors.background,
  },
  practicePressable: {
    borderRadius: 14,
    overflow: 'hidden',
    boxShadow: `0px 4px 12px ${Colors.accentGlow}`,
    elevation: 6,
  },
  practiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  practiceBtnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
});
