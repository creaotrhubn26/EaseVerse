import React, { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/constants/colors';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type LegendItem = {
  icon: IoniconName;
  label: string;
  description: string;
};

type HowToStep = {
  id: 'sing' | 'lyrics' | 'sessions' | 'profile';
  title: string;
  summary: string;
  route: string;
  accent: string;
  icon: IoniconName;
  bullets: string[];
  legend: LegendItem[];
  showWarmupIcons?: boolean;
};

function SnippetFrame({ children }: { children: React.ReactNode }) {
  return <View style={styles.snippetFrame}>{children}</View>;
}

function Legend({ items }: { items: LegendItem[] }) {
  return (
    <View style={styles.legend}>
      {items.map((item) => (
        <View key={`${item.label}-${item.icon}`} style={styles.legendItem}>
          <View style={styles.legendIcon}>
            <Ionicons name={item.icon} size={18} color={Colors.gradientMid} />
          </View>
          <View style={styles.legendCopy}>
            <Text style={styles.legendLabel}>{item.label}</Text>
            <Text style={styles.legendDescription}>{item.description}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  accent,
  hint,
}: {
  label: string;
  onPress: () => void;
  accent: string;
  hint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
    >
      <LinearGradient
        colors={[accent, Colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.primaryBtnGradient}
      >
        <Text style={styles.primaryBtnText}>{label}</Text>
        <Ionicons name="arrow-forward" size={16} color="#111" />
      </LinearGradient>
    </Pressable>
  );
}

export default function HowToUseEaseVerse({ onNavigate }: { onNavigate: (route: string) => void }) {
  const [expanded, setExpanded] = useState<HowToStep['id'] | null>('sing');

  const steps = useMemo<HowToStep[]>(
    () => [
      {
        id: 'sing',
        title: 'Sing',
        summary: 'Record a take and get live lyric guidance.',
        route: '/',
        accent: Colors.gradientStart,
        icon: 'mic',
        bullets: [
          'Pick a song (tap the title at the top).',
          'Tap Record, sing, then tap Stop.',
          'Review your session and open the Practice Loop.',
        ],
        legend: [
          { icon: 'mic', label: 'Record', description: 'Starts a new take.' },
          { icon: 'stop-circle', label: 'Stop', description: 'Ends the take and opens Session Review.' },
          { icon: 'chevron-down', label: 'Song picker', description: 'Switch the active song/lyrics.' },
        ],
        showWarmupIcons: true,
      },
      {
        id: 'lyrics',
        title: 'Lyrics',
        summary: 'Write lyrics, structure sections, and keep them live-ready.',
        route: '/lyrics',
        accent: Colors.successUnderline,
        icon: 'document-text',
        bullets: [
          'Write or import lyrics for your song.',
          'Auto-save keeps the Sing screen ready.',
          'Use Genre to tune coaching defaults for the style.',
        ],
        legend: [
          { icon: 'add-circle-outline', label: 'New song', description: 'Clears the current draft and starts fresh.' },
          { icon: 'layers-outline', label: 'Structure', description: 'Helps you see sections like Verse/Chorus.' },
          { icon: 'download-outline', label: 'Import', description: 'Paste in lyrics from another source.' },
        ],
      },
      {
        id: 'sessions',
        title: 'Sessions',
        summary: 'Track takes over time and find your best performances.',
        route: '/sessions',
        accent: Colors.warningUnderline,
        icon: 'time',
        bullets: [
          'Browse recordings and open Session Review.',
          'Filter by Latest, Best, or Flagged.',
          'Flag your best takes for quick recall.',
        ],
        legend: [
          { icon: 'time-outline', label: 'Latest', description: 'Most recent recordings first.' },
          { icon: 'trophy-outline', label: 'Best', description: 'Sort by your top score.' },
          { icon: 'heart-outline', label: 'Flagged', description: 'Your saved favorites.' },
        ],
      },
      {
        id: 'profile',
        title: 'Profile',
        summary: 'Tune the coaching to your voice, language, and workflow.',
        route: '/profile',
        accent: Colors.gradientMid,
        icon: 'person',
        bullets: [
          'Set Language and Accent Goal for coaching tone.',
          'Adjust Feedback Intensity and Live Mode.',
          'Use Lyrics Sync to pull the latest collab drafts.',
        ],
        legend: [
          { icon: 'language', label: 'Language', description: 'Controls coaching language / phrasing.' },
          { icon: 'pulse', label: 'Feedback', description: 'How frequently coaching prompts appear.' },
          { icon: 'git-merge', label: 'Lyrics sync', description: 'See what changed since your last session.' },
        ],
      },
    ],
    []
  );

  const tabJump = [
    { id: 'sing' as const, label: 'Sing', icon: 'mic' as const, route: '/' },
    { id: 'lyrics' as const, label: 'Lyrics', icon: 'document-text' as const, route: '/lyrics' },
    { id: 'sessions' as const, label: 'Sessions', icon: 'time' as const, route: '/sessions' },
    { id: 'profile' as const, label: 'Profile', icon: 'person' as const, route: '/profile' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.introCard}>
        <View style={styles.introHeader}>
          <View style={styles.introIcon}>
            <Ionicons name="sparkles" size={18} color={Colors.gradientStart} />
          </View>
          <View style={styles.introCopy}>
            <Text style={styles.introTitle}>Quick Tour</Text>
            <Text style={styles.introText}>
              Tap an icon to jump, or expand a card to learn what each button means.
            </Text>
          </View>
        </View>

        <SnippetFrame>
          <View style={styles.tabRow}>
            {tabJump.map((item) => (
              <Pressable
                key={item.id}
                style={styles.tabPill}
                onPress={() => onNavigate(item.route)}
                accessibilityRole="button"
                accessibilityLabel={`Go to ${item.label}`}
                accessibilityHint="Navigates to this screen"
              >
                <Ionicons name={item.icon} size={16} color={Colors.textSecondary} />
                <Text style={styles.tabPillText}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </SnippetFrame>
      </View>

      <View style={styles.steps}>
        {steps.map((step) => {
          const isExpanded = expanded === step.id;
          return (
            <View key={step.id} style={styles.stepCard}>
              <Pressable
                onPress={() => setExpanded((cur) => (cur === step.id ? null : step.id))}
                style={({ pressed }) => [styles.stepHeader, pressed && styles.stepHeaderPressed]}
                accessibilityRole="button"
                accessibilityLabel={`${step.title}. ${step.summary}`}
                accessibilityHint="Expands for details"
              >
                <View style={[styles.stepIcon, { backgroundColor: step.accent + '22', borderColor: step.accent + '55' }]}>
                  <Ionicons name={step.icon} size={18} color={step.accent} />
                </View>
                <View style={styles.stepCopy}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepSummary}>{step.summary}</Text>
                </View>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Colors.textTertiary}
                />
              </Pressable>

              {isExpanded && (
                <View style={styles.stepBody}>
                  <View style={styles.bullets}>
                    {step.bullets.map((line) => (
                      <Text key={line} style={styles.bulletText}>
                        {'\u2022'} {line}
                      </Text>
                    ))}
                  </View>

                  {step.showWarmupIcons && (
                    <SnippetFrame>
                      <Text style={styles.snippetTitle}>Warm-up shortcuts</Text>
                      <View style={styles.warmupRow}>
                        <View style={styles.warmupItem}>
                          <Image
                            source={require('@/assets/images/warmup-icon.png')}
                            style={styles.warmupIcon}
                            accessibilityRole="image"
                            accessibilityLabel="Warm up shortcut icon"
                          />
                          <Text style={styles.warmupText}>Warm Up</Text>
                        </View>
                        <View style={styles.warmupItem}>
                          <Image
                            source={require('@/assets/images/mindfulness-icon.png')}
                            style={styles.warmupIcon}
                            accessibilityRole="image"
                            accessibilityLabel="Mindfulness shortcut icon"
                          />
                          <Text style={styles.warmupText}>Mindfulness</Text>
                        </View>
                      </View>
                    </SnippetFrame>
                  )}

                  <SnippetFrame>
                    <Text style={styles.snippetTitle}>Icon legend</Text>
                    <Legend items={step.legend} />
                  </SnippetFrame>

                  <PrimaryButton
                    label={`Open ${step.title}`}
                    onPress={() => onNavigate(step.route)}
                    accent={step.accent}
                    hint="Navigates to the related screen"
                  />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  introCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    padding: 14,
    gap: 12,
  },
  introHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  introIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.accentSubtle,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introCopy: {
    flex: 1,
    gap: 4,
  },
  introTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  introText: {
    color: Colors.textTertiary,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
  },
  snippetFrame: {
    backgroundColor: Colors.surfaceGlass,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    padding: 12,
    gap: 10,
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    minHeight: 44,
  },
  tabPillText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  steps: {
    gap: 10,
  },
  stepCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    overflow: 'hidden',
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  stepHeaderPressed: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  stepIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCopy: {
    flex: 1,
    gap: 3,
  },
  stepTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  stepSummary: {
    color: Colors.textTertiary,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
  },
  stepBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 12,
  },
  bullets: {
    gap: 6,
  },
  bulletText: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
  },
  snippetTitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  warmupRow: {
    flexDirection: 'row',
    gap: 14,
  },
  warmupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: 'rgba(255,255,255,0.02)',
    flex: 1,
    minHeight: 44,
  },
  warmupIcon: {
    width: 22,
    height: 22,
    resizeMode: 'contain',
  },
  warmupText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  legend: {
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  legendIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.accentSubtle,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  legendCopy: {
    flex: 1,
    gap: 2,
  },
  legendLabel: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  legendDescription: {
    color: Colors.textTertiary,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
  },
  primaryBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  primaryBtnPressed: {
    opacity: 0.95,
  },
  primaryBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 46,
  },
  primaryBtnText: {
    color: '#111',
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
});

