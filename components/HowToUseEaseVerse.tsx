import React, { useMemo, useState } from 'react';
import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/constants/colors';
import type { ComponentProps } from 'react';
import { scaledIconSize, tierValue, useResponsiveLayout } from '@/lib/responsive';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type HowToRoute = '/' | '/lyrics' | '/sessions' | '/profile' | '/easepocket';

type LegendItem = {
  label: string;
  description: string;
} & (
  | { icon: IoniconName; iconImage?: never }
  | { iconImage: ImageSourcePropType; icon?: never }
);

type HowToStep = {
  id: 'sing' | 'lyrics' | 'sessions' | 'easepocket' | 'profile';
  title: string;
  summary: string;
  route: HowToRoute;
  accent: string;
  icon: IoniconName;
  iconImage?: ImageSourcePropType;
  bullets: string[];
  legend: LegendItem[];
  showWarmupIcons?: boolean;
  showQuickStart?: boolean;
};

function SnippetFrame({ children }: { children: React.ReactNode }) {
  return <View style={styles.snippetFrame}>{children}</View>;
}

function IconTiles({
  title,
  items,
}: {
  title: string;
  items: { label: string; source: ImageSourcePropType }[];
}) {
  const responsive = useResponsiveLayout();
  const tileSize = tierValue(responsive.tier, [48, 52, 54, 60, 68, 76, 84]);
  const tileRadius = Math.round(tileSize * 0.28);
  const tileWidth = tierValue(responsive.tier, [100, 112, 120, 132, 148, 164, 180]);
  const labelSize = tierValue(responsive.tier, [11, 12, 12, 13, 13, 14, 15]);

  return (
    <SnippetFrame>
      <Text style={styles.snippetTitle}>{title}</Text>
      <View style={styles.iconTileRow}>
        {items.map((item) => (
          <View key={item.label} style={[styles.iconTile, { width: tileWidth }]}>
            <Image
              source={item.source}
              style={[
                styles.iconTileImage,
                { width: tileSize, height: tileSize, borderRadius: tileRadius },
              ]}
              resizeMode="cover"
              accessible={false}
            />
            <Text style={[styles.iconTileLabel, { fontSize: labelSize }]}>{item.label}</Text>
          </View>
        ))}
      </View>
    </SnippetFrame>
  );
}

function Legend({ items }: { items: LegendItem[] }) {
  const responsive = useResponsiveLayout();
  const legendIconSize = tierValue(responsive.tier, [30, 32, 34, 36, 40, 44, 48]);
  const legendImageSize = tierValue(responsive.tier, [22, 24, 26, 30, 36, 44, 52]);
  const legendImageRadius = Math.round(legendImageSize * 0.34);

  return (
    <View style={styles.legend}>
      {items.map((item, index) => (
        <View key={`${item.label}-${index}`} style={styles.legendItem}>
          <View
            style={[
              styles.legendIcon,
              { width: legendIconSize, height: legendIconSize, borderRadius: Math.round(legendIconSize * 0.31) },
            ]}
          >
            {'iconImage' in item ? (
              <Image
                source={item.iconImage}
                style={[
                  styles.legendIconImage,
                  {
                    width: legendImageSize,
                    height: legendImageSize,
                    borderRadius: legendImageRadius,
                  },
                ]}
                resizeMode="contain"
                accessible={false}
              />
            ) : (
              <Ionicons
                name={item.icon}
                size={tierValue(responsive.tier, [16, 17, 18, 19, 21, 23, 25])}
                color={Colors.gradientMid}
              />
            )}
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
  const responsive = useResponsiveLayout();
  const arrowSize = scaledIconSize(10, responsive);

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
        <Ionicons name="arrow-forward" size={arrowSize} color="#111" />
      </LinearGradient>
    </Pressable>
  );
}

export default function HowToUseEaseVerse({
  onNavigate,
}: {
  onNavigate: (route: HowToRoute) => void;
}) {
  const responsive = useResponsiveLayout();
  const [expanded, setExpanded] = useState<HowToStep['id'] | null>('sing');
  const introIconSize = tierValue(responsive.tier, [34, 36, 38, 42, 48, 56, 64]);
  const stepIconSize = tierValue(responsive.tier, [36, 38, 40, 44, 50, 56, 62]);
  const tabPillIconSize = tierValue(responsive.tier, [20, 22, 24, 26, 30, 34, 38]);
  const warmupIconSize = tierValue(responsive.tier, [22, 24, 24, 26, 30, 34, 38]);
  const sectionMaxWidth = responsive.cardMaxWidth;

  const steps = useMemo<HowToStep[]>(
    () => [
      {
        id: 'sing',
        title: 'Sing',
        summary: 'Record takes with count-in, live lyric tracking, and metronome sync.',
        route: '/',
        accent: Colors.gradientStart,
        icon: 'mic',
        iconImage: require('@/assets/images/icon-set/Singing.png'),
        bullets: [
          'If no song is loaded, use the quick overlay: Warm Up, Mindfulness, or Add Lyrics.',
          'Pick your song from the title dropdown, then confirm Tempo (BPM).',
          'Count-In (0/2/4) and metronome both follow the active song BPM.',
          'Tap Record, sing, then Stop to open Session Review instantly.',
          'Use Practice Loop to drill hard lines after each take.',
        ],
        legend: [
          {
            iconImage: require('@/assets/images/nosong_state.png'),
            label: 'No song state',
            description: 'Shows Warm Up, Mindfulness, and Add Lyrics quick actions.',
          },
          {
            iconImage: require('@/assets/images/record_icon.png'),
            label: 'Record',
            description: 'Starts a new take.',
          },
          {
            iconImage: require('@/assets/images/Stop_icon.png'),
            label: 'Stop',
            description: 'Ends the take and opens Session Review.',
          },
          { icon: 'chevron-down', label: 'Song picker', description: 'Switch the active song/lyrics.' },
          {
            iconImage: require('@/assets/images/metronome_icon.png'),
            label: 'Metronome',
            description: 'Toggles a click track at the song BPM.',
          },
          {
            iconImage: require('@/assets/images/flag_icon.png'),
            label: 'Marker',
            description: 'Adds a marker while recording.',
          },
        ],
        showWarmupIcons: true,
        showQuickStart: true,
      },
      {
        id: 'lyrics',
        title: 'Lyrics',
        summary: 'Write lyrics, detect BPM, and prep your structure for recording.',
        route: '/lyrics',
        accent: Colors.successUnderline,
        icon: 'document-text',
        iconImage: require('@/assets/images/icon-set/Lyrics.png'),
        bullets: [
          'Write or import lyrics for your song.',
          'Set Tempo (BPM) or Tap to detect BPM quickly.',
          'Auto-save keeps the Sing screen ready in real time.',
          'BPM drives count-in, metronome, and EasePocket timing grids.',
          'Use Genre to tune coaching defaults for the style.',
        ],
        legend: [
          { icon: 'add-circle-outline', label: 'New song', description: 'Clears the current draft and starts fresh.' },
          {
            iconImage: require('@/assets/images/bpm_icon.png'),
            label: 'Tempo (BPM)',
            description: 'Syncs count-in + metronome while recording.',
          },
          { icon: 'pulse-outline', label: 'Tap', description: 'Tap repeatedly to detect BPM.' },
          { icon: 'layers-outline', label: 'Structure', description: 'Helps you see sections like Verse/Chorus.' },
          { icon: 'download-outline', label: 'Import', description: 'Paste in lyrics from another source.' },
        ],
      },
      {
        id: 'sessions',
        title: 'Sessions',
        summary: 'Track takes over time and drill tough lines with Practice Loop.',
        route: '/sessions',
        accent: Colors.warningUnderline,
        icon: 'time',
        iconImage: require('@/assets/images/icon-set/sessions.png'),
        bullets: [
          'Browse recordings and open Session Review.',
          'Filter by Latest, Best, or Flagged.',
          'Swipe right to favorite, swipe left to delete.',
          'Tap Practice Loop in Session Review to drill a phrase and adjust speed.',
        ],
        legend: [
          { icon: 'time-outline', label: 'Latest', description: 'Most recent recordings first.' },
          { icon: 'trophy-outline', label: 'Best', description: 'Sort by your top score.' },
          { icon: 'heart-outline', label: 'Flagged', description: 'Your saved favorites.' },
          { icon: 'repeat', label: 'Practice Loop', description: 'Drill a line and slow it down if needed.' },
          { icon: 'trash-outline', label: 'Delete', description: 'Swipe left on a session to remove it.' },
        ],
      },
      {
        id: 'easepocket',
        title: 'EasePocket',
        summary: 'Train internal timing, pocket placement, and consonant precision.',
        route: '/easepocket',
        accent: Colors.gradientEnd,
        icon: 'pulse',
        iconImage: require('@/assets/images/EasePocket.png'),
        bullets: [
          'Choose mode: Subdivision Lab, Silent Beat, Consonant Precision, Pocket Control, or Slow Mastery.',
          'Set BPM from the song, or override BPM for practice drills.',
          'Set beats per bar (2/4) and choose grid when needed.',
          'In Consonant Precision, record a short phrase and tap Stop + Analyze.',
          'Review On-Time %, Mean ms, Offset, and saved drill history.',
        ],
        legend: [
          {
            iconImage: require('@/assets/images/EasePocket.png'),
            label: 'Modes',
            description: 'Switch between five timing training modes.',
          },
          {
            iconImage: require('@/assets/images/bpm_icon.png'),
            label: 'BPM',
            description: 'Controls click speed and timing grid spacing.',
          },
          {
            iconImage: require('@/assets/images/two_beats.png'),
            label: '2/4 Beats',
            description: 'Sets bar accents for count feel and drill flow.',
          },
          { icon: 'grid-outline', label: 'Grid', description: 'Choose Beat / 8th / 16th when available.' },
          { icon: 'mic-outline', label: 'Consonant pass', description: 'Record and score attack timing in ms.' },
        ],
      },
      {
        id: 'profile',
        title: 'Profile',
        summary: 'Tune coaching, count-in, voice, and collaboration sync.',
        route: '/profile',
        accent: Colors.gradientMid,
        icon: 'person',
        iconImage: require('@/assets/images/icon-set/Profile.png'),
        bullets: [
          'Set Language and Accent Goal for coaching tone.',
          'Adjust Live Mode and Lyrics Follow Speed for live tracking behavior.',
          'Choose Count-In: None, 2 beats, or 4 beats.',
          'Choose Mindfulness Voice (Female/Male) for spoken guidance.',
          'Use Lyrics Sync to pull latest collab drafts, update lyrics/BPM, and see diffs.',
        ],
        legend: [
          { icon: 'globe-outline', label: 'Language', description: 'Affects live recognition and pronunciation coaching.' },
          { icon: 'flash-outline', label: 'Live mode', description: 'Stability vs Speed tracking.' },
          {
            iconImage: require('@/assets/images/lyrics_flow_speed_icon.png'),
            label: 'Lyrics speed',
            description: 'How fast the highlighted word advances.',
          },
          {
            iconImage: require('@/assets/images/count_in_icon.png'),
            label: 'Count-in',
            description: 'Choose 0, 2, or 4 beats before recording starts.',
          },
          { icon: 'volume-high-outline', label: 'Mindfulness voice', description: 'Select a male/female voice for narration.' },
          { icon: 'sync-outline', label: 'Lyrics sync', description: 'Pulls latest lyrics + BPM, shows diffs, and fires a synced toast.' },
          {
            iconImage: require('@/assets/images/about_icon.png'),
            label: 'About',
            description: 'Overview of features, API links, and version info.',
          },
        ],
      },
    ],
    []
  );

  const tabJump: (
    | { id: HowToStep['id']; label: string; route: HowToRoute; icon: IoniconName }
    | { id: HowToStep['id']; label: string; route: HowToRoute; image: ImageSourcePropType }
  )[] = [
    { id: 'sing', label: 'Sing', image: require('@/assets/images/icon-set/Singing.png'), route: '/' },
    { id: 'lyrics', label: 'Lyrics', image: require('@/assets/images/icon-set/Lyrics.png'), route: '/lyrics' },
    { id: 'sessions', label: 'Sessions', image: require('@/assets/images/icon-set/sessions.png'), route: '/sessions' },
    { id: 'easepocket', label: 'EasePocket', image: require('@/assets/images/EasePocket.png'), route: '/easepocket' },
    { id: 'profile', label: 'Profile', image: require('@/assets/images/icon-set/Profile.png'), route: '/profile' },
  ];

  return (
    <View
      style={[
        styles.container,
        { width: '100%' as const, maxWidth: sectionMaxWidth, alignSelf: 'center' as const },
      ]}
    >
      <View style={styles.introCard}>
        <View style={styles.introHeader}>
          <View
            style={[
              styles.introIcon,
              {
                width: introIconSize,
                height: introIconSize,
                borderRadius: Math.round(introIconSize * 0.3),
              },
            ]}
          >
            <Image
              source={require('@/assets/images/icon-set/howto-icon.png')}
              style={[
                styles.howToIcon,
                {
                  width: introIconSize,
                  height: introIconSize,
                },
              ]}
              accessibilityRole="image"
              accessibilityLabel="How to use EaseVerse"
            />
          </View>
          <View style={styles.introCopy}>
            <Text style={styles.introTitle}>Quick Tour</Text>
            <Text style={styles.introText}>
              Tap an icon to jump, or expand a card to learn every control. Best flow: add lyrics,
              set BPM, record in Sing, then use EasePocket to tighten timing.
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
                {'icon' in item ? (
                  <Ionicons
                    name={item.icon}
                    size={tierValue(responsive.tier, [16, 17, 18, 20, 22, 24, 26])}
                    color={Colors.textSecondary}
                  />
                ) : (
                  <Image
                    source={item.image}
                    style={[
                      styles.tabPillImage,
                      {
                        width: tabPillIconSize,
                        height: tabPillIconSize,
                        borderRadius: Math.round(tabPillIconSize * 0.28),
                      },
                    ]}
                    resizeMode="cover"
                    accessible={false}
                  />
                )}
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
                <View
                  style={[
                    styles.stepIcon,
                    {
                      width: stepIconSize,
                      height: stepIconSize,
                      borderRadius: Math.round(stepIconSize * 0.32),
                    },
                    step.iconImage
                      ? styles.stepIconImageWrap
                      : { backgroundColor: step.accent + '22', borderColor: step.accent + '55' },
                  ]}
                >
                  {step.iconImage ? (
                    <Image
                      source={step.iconImage}
                      style={[
                        styles.stepIconImage,
                        { width: stepIconSize, height: stepIconSize },
                      ]}
                      resizeMode="cover"
                      accessible={false}
                    />
                  ) : (
                    <Ionicons name={step.icon} size={scaledIconSize(11, responsive)} color={step.accent} />
                  )}
                </View>
                <View style={styles.stepCopy}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepSummary}>{step.summary}</Text>
                </View>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={scaledIconSize(11, responsive)}
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

                  {step.showQuickStart && (
                    <SnippetFrame>
                      <Text style={styles.snippetTitle}>60-second workflow</Text>
                      <Text style={styles.workflowLine}>1. Add lyrics + BPM in Lyrics.</Text>
                      <Text style={styles.workflowLine}>2. (Optional) Warm Up or Mindfulness.</Text>
                      <Text style={styles.workflowLine}>3. Record in Sing with count-in/metronome.</Text>
                      <Text style={styles.workflowLine}>4. Open Session Review and Practice Loop.</Text>
                      <Text style={styles.workflowLine}>5. Run EasePocket drills for timing polish.</Text>
                    </SnippetFrame>
                  )}

                  {step.id === 'sing' && (
                    <IconTiles
                      title="Sing controls"
                      items={[
                        {
                          label: 'Record',
                          source: require('@/assets/images/record_icon.png'),
                        },
                        {
                          label: 'Stop',
                          source: require('@/assets/images/Stop_icon.png'),
                        },
                        {
                          label: 'Metronome',
                          source: require('@/assets/images/metronome_icon.png'),
                        },
                        {
                          label: 'Marker',
                          source: require('@/assets/images/flag_icon.png'),
                        },
                      ]}
                    />
                  )}

                  {step.id === 'profile' && (
                    <IconTiles
                      title="Profile icons"
                      items={[
                        {
                          label: 'Live mode',
                          source: require('@/assets/images/icon-set/Live_mode.png'),
                        },
                        {
                          label: 'Lyrics speed',
                          source: require('@/assets/images/lyrics_flow_speed_icon.png'),
                        },
                        {
                          label: 'Count-in',
                          source: require('@/assets/images/count_in_icon.png'),
                        },
                        {
                          label: 'Feedback',
                          source: require('@/assets/images/icon-set/Feedback_intensity_high.png'),
                        },
                        {
                          label: 'Mindfulness voice',
                          source: require('@/assets/images/icon-set/Mindfullness_voice.png'),
                        },
                        {
                          label: 'Lyrics sync',
                          source: require('@/assets/images/icon-set/Lyrics_sync.png'),
                        },
                        {
                          label: 'About',
                          source: require('@/assets/images/about_icon.png'),
                        },
                      ]}
                    />
                  )}

                  {step.id === 'easepocket' && (
                    <IconTiles
                      title="EasePocket controls"
                      items={[
                        {
                          label: 'BPM',
                          source: require('@/assets/images/bpm_icon.png'),
                        },
                        {
                          label: '2 beats',
                          source: require('@/assets/images/two_beats.png'),
                        },
                        {
                          label: '4 beats',
                          source: require('@/assets/images/four_beats.png'),
                        },
                        {
                          label: 'Trainer',
                          source: require('@/assets/images/EasePocket.png'),
                        },
                      ]}
                    />
                  )}

                  {step.showWarmupIcons && (
                    <SnippetFrame>
                      <Text style={styles.snippetTitle}>Quick shortcuts</Text>
                      <View style={styles.warmupRow}>
                        <View style={styles.warmupItem}>
                          <Image
                            source={require('@/assets/images/warmup-icon.png')}
                            style={[styles.warmupIcon, { width: warmupIconSize, height: warmupIconSize }]}
                            accessibilityRole="image"
                            accessibilityLabel="Warm up shortcut icon"
                          />
                          <Text style={styles.warmupText}>Warm Up</Text>
                        </View>
                        <View style={styles.warmupItem}>
                          <Image
                            source={require('@/assets/images/mindfulness-icon.png')}
                            style={[styles.warmupIcon, { width: warmupIconSize, height: warmupIconSize }]}
                            accessibilityRole="image"
                            accessibilityLabel="Mindfulness shortcut icon"
                          />
                          <Text style={styles.warmupText}>Mindfulness</Text>
                        </View>
                        <View style={styles.warmupItem}>
                          <Image
                            source={require('@/assets/images/EasePocket.png')}
                            style={[styles.warmupIcon, { width: warmupIconSize, height: warmupIconSize }]}
                            accessibilityRole="image"
                            accessibilityLabel="EasePocket timing trainer icon"
                          />
                          <Text style={styles.warmupText}>EasePocket</Text>
                        </View>
                      </View>
                    </SnippetFrame>
                  )}

                  <SnippetFrame>
                    <Text style={styles.snippetTitle}>What each icon means</Text>
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
    overflow: 'hidden',
  },
  howToIcon: {
    width: 34,
    height: 34,
    resizeMode: 'cover',
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
  tabPillImage: {
    width: 18,
    height: 18,
    borderRadius: 5,
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
  stepIconImageWrap: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  stepIconImage: {
    width: 38,
    height: 38,
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
  workflowLine: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_500Medium',
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
    flexWrap: 'wrap',
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
    flexGrow: 1,
    flexBasis: 140,
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
  iconTileRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  iconTile: {
    alignItems: 'center',
    gap: 6,
    width: 120,
  },
  iconTileImage: {
    width: 54,
    height: 54,
    borderRadius: 16,
  },
  iconTileLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
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
  legendIconImage: {
    width: 20,
    height: 20,
    borderRadius: 7,
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
