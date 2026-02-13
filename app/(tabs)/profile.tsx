import React, { ComponentProps } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import type { FeedbackIntensity, LiveMode } from '@/lib/types';

function SettingRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: ComponentProps<typeof Feather>['name'];
  label: string;
  value: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.settingRow, pressed && onPress && styles.settingRowPressed]}
      onPress={onPress}
    >
      <View style={styles.settingLeft}>
        <View style={styles.iconContainer}>
          <Feather name={icon} size={18} color={Colors.gradientMid} />
        </View>
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
      <View style={styles.settingRight}>
        <Text style={styles.settingValue}>{value}</Text>
        {onPress && <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />}
      </View>
    </Pressable>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map(opt => (
        <Pressable
          key={opt.key}
          style={[styles.segment, value === opt.key && styles.segmentActive]}
          onPress={() => {
            onChange(opt.key);
            Haptics.selectionAsync();
          }}
        >
          <Text
            style={[
              styles.segmentText,
              value === opt.key && styles.segmentTextActive,
            ]}
          >
            {opt.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, sessions } = useApp();

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  const totalDuration = sessions.reduce((acc, s) => acc + s.duration, 0);
  const avgAccuracy = sessions.length > 0
    ? Math.round(sessions.reduce((acc, s) => acc + s.insights.textAccuracy, 0) / sessions.length)
    : 0;

  const languages = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Japanese', 'Korean'];
  const accents = ['US', 'UK', 'AU', 'Standard'];

  const cycleLanguage = () => {
    const idx = languages.indexOf(settings.language);
    const next = languages[(idx + 1) % languages.length];
    updateSettings({ language: next });
    Haptics.selectionAsync();
  };

  const cycleAccent = () => {
    const idx = accents.indexOf(settings.accentGoal);
    const next = accents[(idx + 1) % accents.length];
    updateSettings({ accentGoal: next });
    Haptics.selectionAsync();
  };

  const formatDuration = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, webBottomInset) + 100 }}
      >
        <View style={styles.statsCard}>
          <LinearGradient
            colors={[Colors.gradientStart + '15', Colors.gradientEnd + '08']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.statsGradient}
          >
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{sessions.length}</Text>
              <Text style={styles.statLabel}>Sessions</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatDuration(totalDuration)}</Text>
              <Text style={styles.statLabel}>Practice</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{avgAccuracy}%</Text>
              <Text style={styles.statLabel}>Avg Score</Text>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Language & Accent</Text>
          <View style={styles.settingsCard}>
            <SettingRow icon="globe" label="Language" value={settings.language} onPress={cycleLanguage} />
            <View style={styles.divider} />
            <SettingRow icon="mic" label="Accent Goal" value={settings.accentGoal} onPress={cycleAccent} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Feedback Intensity</Text>
          <SegmentedControl<FeedbackIntensity>
            options={[
              { key: 'low', label: 'Low' },
              { key: 'medium', label: 'Medium' },
              { key: 'high', label: 'High' },
            ]}
            value={settings.feedbackIntensity}
            onChange={v => updateSettings({ feedbackIntensity: v })}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Live Mode</Text>
          <SegmentedControl<LiveMode>
            options={[
              { key: 'stability', label: 'Stability' },
              { key: 'speed', label: 'Speed' },
            ]}
            value={settings.liveMode}
            onChange={v => updateSettings({ liveMode: v })}
          />
          <Text style={styles.modeHint}>
            {settings.liveMode === 'stability'
              ? 'Stability mode waits for confident recognition before updating'
              : 'Speed mode shows results immediately with lower confidence'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Count-In</Text>
          <SegmentedControl<string>
            options={[
              { key: '0', label: 'None' },
              { key: '2', label: '2 beats' },
              { key: '4', label: '4 beats' },
            ]}
            value={String(settings.countIn)}
            onChange={v => updateSettings({ countIn: Number(v) as 0 | 2 | 4 })}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.settingsCard}>
            <SettingRow icon="info" label="Version" value="1.0.0" />
            <View style={styles.divider} />
            <SettingRow icon="shield" label="Privacy" value="Local only" />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
  },
  statsCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  statsGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
  },
  statLabel: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.borderGlass,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 10,
  },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  settingsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  settingRowPressed: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  settingValue: {
    color: Colors.textTertiary,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderGlass,
    marginLeft: 60,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: Colors.accentSubtle,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
  },
  segmentText: {
    color: Colors.textTertiary,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  segmentTextActive: {
    color: Colors.gradientStart,
  },
  modeHint: {
    color: Colors.textTertiary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
});
