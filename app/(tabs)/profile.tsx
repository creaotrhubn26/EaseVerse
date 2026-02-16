import React, { ComponentProps, useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Image,
  ActivityIndicator,
  Linking,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import Toast from '@/components/Toast';
import LogoHeader from '@/components/LogoHeader';
import HowToUseEaseVerse from '@/components/HowToUseEaseVerse';
import { apiRequest, getApiUrl } from '@/lib/query-client';
import { parseSongSections } from '@/lib/lyrics-sections';
import * as Storage from '@/lib/storage';
import type { FeedbackIntensity, LiveMode, LyricsFollowSpeed, NarrationVoice, Song } from '@/lib/types';

type CollabLyricsItem = {
  externalTrackId: string;
  title: string;
  lyrics: string;
  updatedAt?: string;
  bpm?: number;
};

type DiffLine = {
  type: 'added' | 'removed' | 'context';
  text: string;
};

type LyricsSyncChange = {
  songId: string;
  title: string;
  externalTrackId: string;
  updatedAt?: string;
  addedLines: number;
  removedLines: number;
  lines: DiffLine[];
  isTruncated: boolean;
};

type AmbiguousLyricsMatch = {
  externalTrackId: string;
  title: string;
  candidateCount: number;
};

const DIFF_PREVIEW_LIMIT = 18;

function normalizeTitle(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function parseIsoTimestampMs(value?: string): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildLyricsSyncRoute(): string {
  const params = new URLSearchParams();
  const source = process.env.EXPO_PUBLIC_LYRICS_SYNC_SOURCE?.trim();
  const projectId = process.env.EXPO_PUBLIC_LYRICS_SYNC_PROJECT_ID?.trim();

  if (source) {
    params.set('source', source);
  }
  if (projectId) {
    params.set('projectId', projectId);
  }

  const query = params.toString();
  return query ? `/api/v1/collab/lyrics?${query}` : '/api/v1/collab/lyrics';
}

function parseCollabItem(input: unknown): CollabLyricsItem | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }

  const raw = input as Record<string, unknown>;
  if (
    typeof raw.externalTrackId !== 'string' ||
    typeof raw.title !== 'string' ||
    typeof raw.lyrics !== 'string'
  ) {
    return null;
  }

  const rawBpm = raw.bpm;
  const parsedBpm =
    typeof rawBpm === 'number' && Number.isFinite(rawBpm)
      ? Math.round(rawBpm)
      : typeof rawBpm === 'string' && rawBpm.trim()
        ? Number.parseInt(rawBpm.trim(), 10)
        : undefined;
  const bpm =
    typeof parsedBpm === 'number' && Number.isFinite(parsedBpm)
      ? Math.max(30, Math.min(300, parsedBpm))
      : undefined;

  return {
    externalTrackId: raw.externalTrackId,
    title: raw.title,
    lyrics: raw.lyrics,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    bpm,
  };
}

function dedupeCollabItems(items: CollabLyricsItem[]): CollabLyricsItem[] {
  const byTrackId = new Map<string, CollabLyricsItem>();
  for (const item of items) {
    const current = byTrackId.get(item.externalTrackId);
    if (!current) {
      byTrackId.set(item.externalTrackId, item);
      continue;
    }
    const currentTime = parseIsoTimestampMs(current.updatedAt);
    const incomingTime = parseIsoTimestampMs(item.updatedAt);
    if (incomingTime >= currentTime) {
      byTrackId.set(item.externalTrackId, item);
    }
  }
  return Array.from(byTrackId.values());
}

function buildSongTitleCandidatesMap(songs: Song[]): Map<string, Song[]> {
  const candidates = new Map<string, Song[]>();
  for (const song of songs) {
    const key = normalizeTitle(song.title);
    if (!key) {
      continue;
    }
    const existing = candidates.get(key) ?? [];
    existing.push(song);
    candidates.set(key, existing);
  }
  return candidates;
}

function buildLineDiff(
  previousLyrics: string,
  nextLyrics: string,
  maxPreviewLines = DIFF_PREVIEW_LIMIT
): { lines: DiffLine[]; addedLines: number; removedLines: number; isTruncated: boolean } {
  const previousLines = previousLyrics.replace(/\r\n/g, '\n').split('\n');
  const nextLines = nextLyrics.replace(/\r\n/g, '\n').split('\n');
  const n = previousLines.length;
  const m = nextLines.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (previousLines[i] === nextLines[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const rawLines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let addedLines = 0;
  let removedLines = 0;

  while (i < n && j < m) {
    if (previousLines[i] === nextLines[j]) {
      rawLines.push({ type: 'context', text: previousLines[i] });
      i += 1;
      j += 1;
      continue;
    }

    if (dp[i + 1][j] >= dp[i][j + 1]) {
      rawLines.push({ type: 'removed', text: previousLines[i] });
      removedLines += 1;
      i += 1;
    } else {
      rawLines.push({ type: 'added', text: nextLines[j] });
      addedLines += 1;
      j += 1;
    }
  }

  while (i < n) {
    rawLines.push({ type: 'removed', text: previousLines[i] });
    removedLines += 1;
    i += 1;
  }
  while (j < m) {
    rawLines.push({ type: 'added', text: nextLines[j] });
    addedLines += 1;
    j += 1;
  }

  const changedIndices = rawLines
    .map((line, index) => (line.type === 'context' ? -1 : index))
    .filter((index) => index >= 0);

  if (changedIndices.length === 0) {
    return {
      lines: rawLines.slice(0, maxPreviewLines),
      addedLines,
      removedLines,
      isTruncated: rawLines.length > maxPreviewLines,
    };
  }

  const selectedIndices = new Set<number>();
  for (const index of changedIndices) {
    selectedIndices.add(index);
    if (index > 0) selectedIndices.add(index - 1);
    if (index + 1 < rawLines.length) selectedIndices.add(index + 1);
  }

  const previewIndices = Array.from(selectedIndices)
    .sort((a, b) => a - b)
    .slice(0, maxPreviewLines);

  return {
    lines: previewIndices.map((index) => rawLines[index]),
    addedLines,
    removedLines,
    isTruncated: previewIndices.length < selectedIndices.size || previewIndices.length < rawLines.length,
  };
}

function SettingRow({
  icon,
  label,
  value,
  onPress,
  accessibilityHint,
}: {
  icon: ComponentProps<typeof Feather>['name'];
  label: string;
  value: string;
  onPress?: () => void;
  accessibilityHint?: string;
}) {
  if (!onPress) {
    return (
      <View style={styles.settingRow}>
        <View style={styles.settingLeft}>
          <View style={styles.iconContainer}>
            <Feather name={icon} size={18} color={Colors.gradientMid} />
          </View>
          <Text style={styles.settingLabel}>{label}</Text>
        </View>
        <View style={styles.settingRight}>
          <Text style={styles.settingValue}>{value}</Text>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.settingRow, pressed && styles.settingRowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint={accessibilityHint}
    >
      <View style={styles.settingLeft}>
        <View style={styles.iconContainer}>
          <Feather name={icon} size={18} color={Colors.gradientMid} />
        </View>
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
        <View style={styles.settingRight}>
          <Text style={styles.settingValue}>{value}</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
      </View>
    </Pressable>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string; iconImage?: ImageSourcePropType }[];
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
          accessibilityRole="button"
          accessibilityLabel={`${opt.label} option`}
          accessibilityHint="Updates this setting"
          accessibilityState={{ selected: value === opt.key }}
        >
          {opt.iconImage ? (
            <Image
              source={opt.iconImage}
              style={[styles.segmentIcon, { opacity: value === opt.key ? 1 : 0.6 }]}
              resizeMode="contain"
              accessible={false}
            />
          ) : (
            <Text
              style={[
                styles.segmentText,
                value === opt.key && styles.segmentTextActive,
              ]}
            >
              {opt.label}
            </Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const {
    settings,
    updateSettings,
    sessions,
    songs,
    activeSong,
    updateSong,
    setActiveSong,
  } = useApp();
  const [howToExpanded, setHowToExpanded] = useState(true);
  const [syncingLyrics, setSyncingLyrics] = useState(false);
  const [syncChanges, setSyncChanges] = useState<LyricsSyncChange[]>([]);
  const [lastLyricsSyncAt, setLastLyricsSyncAt] = useState<number | null>(null);
  const [syncSummary, setSyncSummary] = useState({
    changed: 0,
    unchanged: 0,
    unmatched: 0,
    ambiguous: 0,
  });
  const [ambiguousMatches, setAmbiguousMatches] = useState<AmbiguousLyricsMatch[]>([]);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    variant?: 'success' | 'error' | 'info';
  }>({
    visible: false,
    message: '',
    variant: 'info',
  });

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  const apiBaseUrl = useMemo(() => getApiUrl(), []);
  const apiHost = useMemo(() => {
    try {
      const parsed = new URL(apiBaseUrl);
      return parsed.host;
    } catch {
      return apiBaseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }
  }, [apiBaseUrl]);

  const openUrl = useCallback(
    async (url: string) => {
      try {
        await Linking.openURL(url);
      } catch (error) {
        console.warn('Failed to open URL:', url, error);
        setToast({
          visible: true,
          message: 'Unable to open link on this device.',
          variant: 'error',
        });
      }
    },
    [setToast]
  );

  const handleOpenApiCatalog = useCallback(() => {
    const url = new URL('/api/v1', apiBaseUrl).toString();
    void openUrl(url);
  }, [apiBaseUrl, openUrl]);

  const handleOpenOpenApiJson = useCallback(() => {
    const url = new URL('/api/v1/openapi.json', apiBaseUrl).toString();
    void openUrl(url);
  }, [apiBaseUrl, openUrl]);

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

  const formatSyncTime = useCallback((timestamp: number | null) => {
    if (!timestamp || !Number.isFinite(timestamp)) {
      return 'Never';
    }
    return new Date(timestamp).toLocaleString();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const snapshots = await Storage.getLyricsSnapshots();
      const snapshotValues = Object.values(snapshots);
      if (cancelled || snapshotValues.length === 0) {
        return;
      }
      const latest = Math.max(...snapshotValues.map((snapshot) => snapshot.syncedAt || 0));
      if (Number.isFinite(latest) && latest > 0) {
        setLastLyricsSyncAt(latest);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSyncLatestLyrics = useCallback(async () => {
    if (syncingLyrics) {
      return;
    }

    setSyncingLyrics(true);
    try {
      const response = await apiRequest('GET', buildLyricsSyncRoute());
      const payload = (await response.json()) as { items?: unknown[] };
      const remoteItems = Array.isArray(payload.items)
        ? dedupeCollabItems(
            payload.items
              .map(parseCollabItem)
              .filter((item): item is CollabLyricsItem => Boolean(item))
          )
        : [];

      if (remoteItems.length === 0) {
        setSyncSummary({ changed: 0, unchanged: 0, unmatched: 0, ambiguous: 0 });
        setAmbiguousMatches([]);
        setSyncChanges([]);
        setLastLyricsSyncAt(Date.now());
        setToast({
          visible: true,
          message: 'Lyrics synced. No remote lyric drafts found.',
          variant: 'info',
        });
        return;
      }

      const snapshots = await Storage.getLyricsSnapshots();
      const nextSnapshots: Storage.LyricsSnapshotMap = { ...snapshots };
      const pendingSongUpdates = new Map<string, Song>();
      const changes: LyricsSyncChange[] = [];
      const songsById = new Map(songs.map((song) => [song.id, song]));
      const songsByTitle = buildSongTitleCandidatesMap(songs);
      const songIdBySourceTrackId = new Map<string, string>();
      const ambiguousItems: AmbiguousLyricsMatch[] = [];
      for (const [songId, snapshot] of Object.entries(nextSnapshots)) {
        if (snapshot.sourceTrackId) {
          songIdBySourceTrackId.set(snapshot.sourceTrackId, songId);
        }
      }
      let changed = 0;
      let unchanged = 0;
      let unmatched = 0;
      let ambiguous = 0;

      for (const item of remoteItems) {
        const snapshotSongId = songIdBySourceTrackId.get(item.externalTrackId);
        let matchedSong =
          (snapshotSongId ? songsById.get(snapshotSongId) : undefined) ??
          songsById.get(item.externalTrackId);

        if (!matchedSong) {
          const titleCandidates = songsByTitle.get(normalizeTitle(item.title)) ?? [];
          if (titleCandidates.length === 1) {
            matchedSong = titleCandidates[0];
          } else if (titleCandidates.length > 1) {
            ambiguous += 1;
            ambiguousItems.push({
              externalTrackId: item.externalTrackId,
              title: item.title,
              candidateCount: titleCandidates.length,
            });
            continue;
          }
        }

        if (!matchedSong) {
          unmatched += 1;
          continue;
        }

        const incomingLyrics = item.lyrics.replace(/\r\n/g, '\n');
        const incomingBpm =
          typeof item.bpm === 'number' && Number.isFinite(item.bpm)
            ? Math.max(30, Math.min(300, Math.round(item.bpm)))
            : undefined;

        const snapshotLyrics = nextSnapshots[matchedSong.id]?.lyrics ?? matchedSong.lyrics;
        const snapshotBpm = nextSnapshots[matchedSong.id]?.bpm ?? matchedSong.bpm;
        const hasLyricsDiffSinceLastSession = snapshotLyrics !== incomingLyrics;
        const hasTempoDiffSinceLastSession =
          typeof incomingBpm === 'number' && incomingBpm !== snapshotBpm;
        const hasDiffSinceLastSession =
          hasLyricsDiffSinceLastSession || hasTempoDiffSinceLastSession;

        const shouldUpdateLyrics = matchedSong.lyrics !== incomingLyrics;
        const shouldUpdateTempo =
          typeof incomingBpm === 'number' && incomingBpm !== matchedSong.bpm;

        if (shouldUpdateLyrics || shouldUpdateTempo) {
          pendingSongUpdates.set(matchedSong.id, {
            ...matchedSong,
            ...(shouldUpdateLyrics
              ? {
                  lyrics: incomingLyrics,
                  sections: parseSongSections(incomingLyrics),
                }
              : {}),
            ...(shouldUpdateTempo ? { bpm: incomingBpm } : {}),
            updatedAt: Date.now(),
          });
        }

        if (hasDiffSinceLastSession) {
          changed += 1;
          if (hasLyricsDiffSinceLastSession) {
            const diff = buildLineDiff(snapshotLyrics, incomingLyrics);
            changes.push({
              songId: matchedSong.id,
              title: matchedSong.title,
              externalTrackId: item.externalTrackId,
              updatedAt: item.updatedAt,
              addedLines: diff.addedLines,
              removedLines: diff.removedLines,
              lines: diff.lines,
              isTruncated: diff.isTruncated,
            });
          } else {
            const beforeLabel = typeof snapshotBpm === 'number' ? `${snapshotBpm} BPM` : 'unset';
            const afterLabel = typeof incomingBpm === 'number' ? `${incomingBpm} BPM` : 'unset';
            changes.push({
              songId: matchedSong.id,
              title: matchedSong.title,
              externalTrackId: item.externalTrackId,
              updatedAt: item.updatedAt,
              addedLines: 0,
              removedLines: 0,
              lines: [{ type: 'context', text: `Tempo updated: ${beforeLabel} -> ${afterLabel}` }],
              isTruncated: false,
            });
          }
        } else {
          unchanged += 1;
        }

        nextSnapshots[matchedSong.id] = {
          lyrics: incomingLyrics,
          bpm:
            typeof incomingBpm === 'number'
              ? incomingBpm
              : nextSnapshots[matchedSong.id]?.bpm ?? matchedSong.bpm,
          syncedAt: Date.now(),
          remoteUpdatedAt: item.updatedAt,
          sourceTrackId: item.externalTrackId,
        };
        songIdBySourceTrackId.set(item.externalTrackId, matchedSong.id);
      }

      for (const updatedSong of pendingSongUpdates.values()) {
        updateSong(updatedSong);
        if (activeSong?.id === updatedSong.id) {
          setActiveSong(updatedSong);
        }
      }

      await Storage.saveLyricsSnapshots(nextSnapshots);
      setSyncSummary({ changed, unchanged, unmatched, ambiguous });
      setAmbiguousMatches(ambiguousItems.slice(0, 5));
      setSyncChanges(changes);
      setLastLyricsSyncAt(Date.now());

      if (changed > 0) {
        setToast({
          visible: true,
          message:
            `Synced latest lyrics. ${changed} change${changed === 1 ? '' : 's'} since last session.` +
            (ambiguous > 0
              ? ` ${ambiguous} draft${ambiguous === 1 ? '' : 's'} skipped due to duplicate local song titles.`
              : ''),
          variant: 'success',
        });
      } else {
        setToast({
          visible: true,
          message:
            'Synced latest lyrics. No changes since last session.' +
            (ambiguous > 0
              ? ` ${ambiguous} draft${ambiguous === 1 ? '' : 's'} skipped due to duplicate local song titles.`
              : ''),
          variant: 'info',
        });
      }
    } catch (error) {
      console.error('Lyrics sync failed:', error);
      setToast({
        visible: true,
        message: 'Lyrics sync failed. Check API connection and key.',
        variant: 'error',
      });
    } finally {
      setSyncingLyrics(false);
    }
  }, [activeSong?.id, setActiveSong, songs, syncingLyrics, updateSong]);

  const sortedSyncChanges = useMemo(
    () =>
      [...syncChanges].sort((a, b) => {
        const aTime = parseIsoTimestampMs(a.updatedAt);
        const bTime = parseIsoTimestampMs(b.updatedAt);
        return bTime - aTime;
      }),
    [syncChanges]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <Toast
        visible={toast.visible}
        message={toast.message}
        variant={toast.variant ?? 'info'}
        sound={
          toast.variant === 'success' && toast.message.startsWith('Synced latest lyrics.')
            ? 'lyricsUpdated'
            : 'none'
        }
        onHide={() => setToast((current) => ({ ...current, visible: false }))}
      />
      <LogoHeader variant="hero" />
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
          <Pressable
            onPress={() => {
              setHowToExpanded((current) => !current);
              Haptics.selectionAsync();
            }}
            style={({ pressed }) => [styles.sectionHeader, pressed && styles.sectionHeaderPressed]}
            accessibilityRole="button"
            accessibilityLabel="How To Use"
            accessibilityHint={howToExpanded ? 'Collapses the help tour' : 'Expands the help tour'}
            accessibilityState={{ expanded: howToExpanded }}
          >
            <View style={styles.sectionTitleRow}>
              <Image
                source={require('@/assets/images/icon-set/howto-icon.png')}
                style={styles.sectionHeaderIcon}
                resizeMode="cover"
                accessible={false}
              />
            </View>
            <Ionicons
              name={howToExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={Colors.textTertiary}
            />
          </Pressable>
          {howToExpanded ? (
            <HowToUseEaseVerse
              onNavigate={(route) => {
                Haptics.selectionAsync();
                router.push(route as any);
              }}
            />
          ) : (
            <Text style={styles.modeHint}>Tap to expand the quick tour and icon legend.</Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Image
              source={require('@/assets/images/icon-set/Language_accent.png')}
              style={styles.sectionTitleIcon}
              resizeMode="cover"
              accessibilityRole="header"
              accessibilityLabel="Language & Accent"
            />
          </View>
          <View style={styles.settingsCard}>
            <SettingRow
              icon="globe"
              label="Language"
              value={settings.language}
              onPress={cycleLanguage}
              accessibilityHint="Cycles to the next language"
            />
            <View style={styles.divider} />
            <SettingRow
              icon="mic"
              label="Accent Goal"
              value={settings.accentGoal}
              onPress={cycleAccent}
              accessibilityHint="Cycles to the next accent target"
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Image
              source={require('@/assets/images/icon-set/Feedback_intensity_high.png')}
              style={styles.sectionTitleIcon}
              resizeMode="cover"
              accessibilityRole="header"
              accessibilityLabel="Feedback Intensity"
            />
          </View>
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
          <View style={styles.sectionTitleRow}>
            <Image
              source={require('@/assets/images/icon-set/Live_mode.png')}
              style={styles.sectionTitleIcon}
              resizeMode="cover"
              accessibilityRole="header"
              accessibilityLabel="Live Mode"
            />
          </View>
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
          <Text style={styles.sectionTitle} accessibilityRole="header">Lyrics Follow Speed</Text>
          <SegmentedControl<LyricsFollowSpeed>
            options={[
              { key: 'slow', label: 'Slow' },
              { key: 'normal', label: 'Normal' },
              { key: 'fast', label: 'Fast' },
            ]}
            value={settings.lyricsFollowSpeed}
            onChange={(v) => updateSettings({ lyricsFollowSpeed: v })}
          />
          <Text style={styles.modeHint}>
            Controls how quickly the highlighted word advances in live tracking (most noticeable in Speed mode).
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Count-In</Text>
          <SegmentedControl<string>
            options={[
              { key: '0', label: 'None' },
              { key: '2', label: '2 beats', iconImage: require('@/assets/images/two_beats.png') },
              { key: '4', label: '4 beats', iconImage: require('@/assets/images/four_beats.png') },
            ]}
            value={String(settings.countIn)}
            onChange={v => updateSettings({ countIn: Number(v) as 0 | 2 | 4 })}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Image
              source={require('@/assets/images/icon-set/Mindfullness_voice.png')}
              style={styles.sectionTitleIcon}
              resizeMode="cover"
              accessibilityRole="header"
              accessibilityLabel="Mindfulness Voice"
            />
          </View>
          <SegmentedControl<NarrationVoice>
            options={[
              { key: 'female', label: 'Female', iconImage: require('@/assets/images/Female.png') },
              { key: 'male', label: 'Male', iconImage: require('@/assets/images/Male.png') },
            ]}
            value={settings.narrationVoice}
            onChange={(v) => updateSettings({ narrationVoice: v })}
          />
          <Text style={styles.modeHint}>
            Used for mindfulness narration (and other spoken guidance).
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Image
              source={require('@/assets/images/icon-set/Lyrics_sync.png')}
              style={styles.sectionTitleIcon}
              resizeMode="cover"
              accessibilityRole="header"
              accessibilityLabel="Lyrics Sync"
            />
          </View>
          <View style={styles.settingsCard}>
            <SettingRow
              icon="refresh-cw"
              label="Sync Latest Lyrics"
              value={syncingLyrics ? 'Syncing...' : 'Run now'}
              onPress={syncingLyrics ? undefined : handleSyncLatestLyrics}
              accessibilityHint="Pulls latest collaborative lyric drafts and compares with last synced session"
            />
            <View style={styles.divider} />
            <SettingRow
              icon="clock"
              label="Last Synced"
              value={formatSyncTime(lastLyricsSyncAt)}
            />
            <View style={styles.divider} />
            <SettingRow
              icon="git-merge"
              label="Changes Since Last Session"
              value={String(syncSummary.changed)}
            />
            {syncingLyrics && (
              <View style={styles.syncingRow}>
                <ActivityIndicator size="small" color={Colors.gradientStart} />
                <Text style={styles.syncingText}>Fetching latest drafts and calculating differences...</Text>
              </View>
            )}
          </View>

          {syncSummary.unmatched > 0 && (
            <Text style={styles.modeHint}>
              {syncSummary.unmatched} remote draft{syncSummary.unmatched === 1 ? '' : 's'} could not be matched to a local song.
            </Text>
          )}

          {syncSummary.ambiguous > 0 && (
            <Text style={styles.modeHint}>
              {syncSummary.ambiguous} remote draft{syncSummary.ambiguous === 1 ? '' : 's'} skipped because duplicate local song titles caused ambiguous matching.
            </Text>
          )}

          {ambiguousMatches.length > 0 && (
            <View style={styles.ambiguousList}>
              {ambiguousMatches.map((item) => (
                <Text key={item.externalTrackId} style={styles.ambiguousItem}>
                  - {item.title} ({item.externalTrackId}) matched {item.candidateCount} local songs.
                </Text>
              ))}
            </View>
          )}

          {(syncSummary.changed > 0 || syncSummary.unchanged > 0) && (
            <Text style={styles.modeHint}>
              Last sync: {syncSummary.changed} changed, {syncSummary.unchanged} unchanged, {syncSummary.ambiguous} skipped (ambiguous), {syncSummary.unmatched} unmatched.
            </Text>
          )}

          {sortedSyncChanges.length > 0 && (
            <View style={styles.diffList}>
              {sortedSyncChanges.map((change) => (
                <View key={`${change.songId}-${change.externalTrackId}`} style={styles.diffCard}>
                  <View style={styles.diffHeader}>
                    <Text style={styles.diffTitle}>{change.title}</Text>
                    <Text style={styles.diffStats}>+{change.addedLines} / -{change.removedLines}</Text>
                  </View>
                  <Text style={styles.diffMeta}>
                    Source: {change.externalTrackId}
                    {change.updatedAt ? ` • Updated ${new Date(change.updatedAt).toLocaleString()}` : ''}
                  </Text>
                  <View style={styles.diffLines}>
                    {change.lines.map((line, index) => (
                      <Text
                        key={`${change.songId}-${index}`}
                        style={[
                          styles.diffLine,
                          line.type === 'added'
                            ? styles.diffLineAdded
                            : line.type === 'removed'
                              ? styles.diffLineRemoved
                              : styles.diffLineContext,
                        ]}
                      >
                        {line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  '}
                        {line.text || ' '}
                      </Text>
                    ))}
                    {change.isTruncated && (
                      <Text style={styles.diffTruncated}>...more lines changed</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

	        <View style={styles.section}>
	          <Text style={styles.sectionTitle} accessibilityRole="header">About</Text>
	          <View style={styles.aboutCard}>
	            <View style={styles.aboutRow}>
	              <View style={styles.aboutIconWrap}>
	                <Image
	                  source={require('@/assets/images/easeverse_logo_App.png')}
	                  style={styles.aboutIcon}
	                  resizeMode="contain"
	                  accessibilityRole="image"
	                  accessibilityLabel="EaseVerse app icon"
	                />
	              </View>
	              <View style={styles.aboutCopy}>
	                <Text style={styles.aboutTitle}>EaseVerse</Text>
	                <Text style={styles.aboutText}>
	                  Live lyric guidance, credible session reviews, and practice loops for vocalists.
	                  Keep lyrics synced with your team and iterate fast.
	                </Text>
	              </View>
	            </View>
	          </View>

	          <View style={styles.settingsCard}>
	            <SettingRow icon="info" label="Version" value="1.0.0" />
	            <View style={styles.divider} />
	            <SettingRow icon="globe" label="API" value={apiHost || 'Unknown'} />
	            <View style={styles.divider} />
	            <SettingRow
	              icon="link"
	              label="API Catalog"
	              value="Open"
	              onPress={handleOpenApiCatalog}
	              accessibilityHint="Opens the API discovery document in your browser"
	            />
	            <View style={styles.divider} />
	            <SettingRow
	              icon="file-text"
	              label="OpenAPI Spec"
	              value="Open"
	              onPress={handleOpenOpenApiJson}
	              accessibilityHint="Opens the OpenAPI JSON spec in your browser"
	            />
	            <View style={styles.divider} />
	            <SettingRow icon="shield" label="Privacy" value="Local + optional Postgres" />
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
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeaderIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
  },
  sectionTitleIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  sectionHeaderPressed: {
    opacity: 0.9,
  },
  settingsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    overflow: 'hidden',
  },
  aboutCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    padding: 14,
    marginBottom: 12,
  },
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  aboutIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  aboutIcon: {
    width: 44,
    height: 44,
  },
  aboutCopy: {
    flex: 1,
    gap: 4,
  },
  aboutTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  aboutText: {
    color: Colors.textTertiary,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
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
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: Colors.accentSubtle,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
  },
  segmentIcon: {
    width: 44,
    height: 30,
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
  syncingRow: {
    marginTop: 8,
    marginHorizontal: 16,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncingText: {
    color: Colors.textTertiary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  ambiguousList: {
    marginTop: -2,
    gap: 2,
  },
  ambiguousItem: {
    color: Colors.textTertiary,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Inter_400Regular',
  },
  diffList: {
    gap: 10,
  },
  diffCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    padding: 12,
    gap: 8,
  },
  diffHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  diffTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
  },
  diffStats: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  diffMeta: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  diffLines: {
    backgroundColor: Colors.surfaceGlassLyrics,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 2,
  },
  diffLine: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
  },
  diffLineAdded: {
    color: Colors.successUnderline,
  },
  diffLineRemoved: {
    color: Colors.dangerUnderline,
  },
  diffLineContext: {
    color: Colors.textTertiary,
  },
  diffTruncated: {
    color: Colors.textTertiary,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
});
