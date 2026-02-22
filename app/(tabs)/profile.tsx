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
import { fetchLearningRecommendations } from '@/lib/learning-client';
import { scaledIconSize, tierValue, useResponsiveLayout } from '@/lib/responsive';
import {
  buildLyricsSyncRoute,
  buildSongTitleCandidatesMap,
  dedupeCollabItems,
  normalizeTitle,
  parseCollabItem,
  parseIsoTimestampMs,
  type CollabLyricsItem,
  resolveLyricsSyncConfig,
} from '@/lib/collab-lyrics';
import * as Storage from '@/lib/storage';
import type { FeedbackIntensity, LiveMode, LyricsFollowSpeed, NarrationVoice, Song } from '@/lib/types';

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

type LearningRecommendationsView = {
  focusWords: string[];
  globalChallengeWords: string[];
  practicePlan: {
    type: 'lyrics' | 'timing';
    title: string;
    reason: string;
    targetMode?: string;
  }[];
};

const DIFF_PREVIEW_LIMIT = 18;
const DIFF_MAX_CELLS = 200000;
const howToIconSource =
  Platform.OS === 'web'
    ? require('@/assets/images/icon-set/howto-icon.webp')
    : require('@/assets/images/icon-set/howto-icon.png');
const languageAccentIconSource =
  Platform.OS === 'web'
    ? require('@/assets/images/icon-set/Language_accent.webp')
    : require('@/assets/images/icon-set/Language_accent.png');
const feedbackHighIconSource =
  Platform.OS === 'web'
    ? require('@/assets/images/icon-set/Feedback_intensity_high.webp')
    : require('@/assets/images/icon-set/Feedback_intensity_high.png');
const liveModeIconSource =
  Platform.OS === 'web'
    ? require('@/assets/images/icon-set/Live_mode.webp')
    : require('@/assets/images/icon-set/Live_mode.png');
const easePocketIconSource =
  Platform.OS === 'web'
    ? require('@/assets/images/EasePocket.webp')
    : require('@/assets/images/EasePocket.png');
const lyricsFlowSpeedIconSource =
  Platform.OS === 'web'
    ? require('@/assets/images/lyrics_flow_speed_icon.webp')
    : require('@/assets/images/lyrics_flow_speed_icon.png');
const countInIconSource =
  Platform.OS === 'web'
    ? require('@/assets/images/count_in_icon.webp')
    : require('@/assets/images/count_in_icon.png');
const twoBeatsIconSource =
  Platform.OS === 'web'
    ? require('@/assets/images/two_beats.webp')
    : require('@/assets/images/two_beats.png');
const fourBeatsIconSource =
  Platform.OS === 'web'
    ? require('@/assets/images/four_beats.webp')
    : require('@/assets/images/four_beats.png');
const aboutIconSource =
  Platform.OS === 'web'
    ? require('@/assets/images/about_icon.webp')
    : require('@/assets/images/about_icon.png');

function buildLineDiff(
  previousLyrics: string,
  nextLyrics: string,
  maxPreviewLines = DIFF_PREVIEW_LIMIT
): { lines: DiffLine[]; addedLines: number; removedLines: number; isTruncated: boolean } {
  const previousLines = previousLyrics.replace(/\r\n/g, '\n').split('\n');
  const nextLines = nextLyrics.replace(/\r\n/g, '\n').split('\n');
  const n = previousLines.length;
  const m = nextLines.length;

  const rawLines: DiffLine[] = [];
  let addedLines = 0;
  let removedLines = 0;

  if (n * m > DIFF_MAX_CELLS) {
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (previousLines[i] === nextLines[j]) {
        rawLines.push({ type: 'context', text: previousLines[i] });
      } else {
        rawLines.push({ type: 'removed', text: previousLines[i] });
        rawLines.push({ type: 'added', text: nextLines[j] });
        removedLines += 1;
        addedLines += 1;
      }
      i += 1;
      j += 1;
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
  } else {
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

    let i = 0;
    let j = 0;

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
  const responsive = useResponsiveLayout();
  const iconDisplayScale = responsive.isWeb ? 1 + (responsive.highResScale - 1) * 0.9 : 1;
  const scaleDisplay = (value: number) => Math.round(value * iconDisplayScale);
  const iconContainerSize = scaleDisplay(tierValue(responsive.tier, [40, 46, 52, 60, 74, 92, 112]));
  const iconGlyphSize = scaleDisplay(tierValue(responsive.tier, [20, 22, 24, 28, 34, 40, 46]));

  if (!onPress) {
    return (
      <View style={styles.settingRow}>
        <View style={styles.settingLeft}>
          <View
            style={[
              styles.iconContainer,
              {
                width: iconContainerSize,
                height: iconContainerSize,
                borderRadius: Math.round(iconContainerSize * 0.26),
              },
            ]}
          >
            <Feather name={icon} size={iconGlyphSize} color={Colors.gradientMid} />
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
        <View
          style={[
            styles.iconContainer,
            {
              width: iconContainerSize,
              height: iconContainerSize,
              borderRadius: Math.round(iconContainerSize * 0.26),
            },
          ]}
        >
          <Feather name={icon} size={iconGlyphSize} color={Colors.gradientMid} />
        </View>
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
        <View style={styles.settingRight}>
          <Text style={styles.settingValue}>{value}</Text>
          <Ionicons name="chevron-forward" size={scaledIconSize(10, responsive)} color={Colors.textTertiary} />
      </View>
    </Pressable>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string; iconImage?: ImageSourcePropType; iconScale?: number }[];
  value: T;
  onChange: (key: T) => void;
}) {
  const responsive = useResponsiveLayout();
  const iconDisplayScale = responsive.isWeb ? 1 + (responsive.highResScale - 1) * 0.9 : 1;
  const scaleDisplay = (value: number) => Math.round(value * iconDisplayScale);
  const segmentIconWidth = scaleDisplay(tierValue(responsive.tier, [56, 64, 72, 84, 104, 128, 156]));
  const segmentIconHeight = scaleDisplay(tierValue(responsive.tier, [36, 40, 44, 50, 60, 72, 86]));

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
              style={[
                styles.segmentIcon,
                {
                  width: Math.round(segmentIconWidth * (opt.iconScale ?? 1)),
                  height: Math.round(segmentIconHeight * (opt.iconScale ?? 1)),
                  opacity: value === opt.key ? 1 : 0.6,
                },
              ]}
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
  const responsive = useResponsiveLayout();
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
  const [learningLoading, setLearningLoading] = useState(false);
  const [learningRecommendations, setLearningRecommendations] = useState<LearningRecommendationsView | null>(null);
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
  const sectionPadding = responsive.contentPadding;
  const contentMaxWidth = responsive.contentMaxWidth;
  const iconDisplayScale = responsive.isWeb ? 1 + (responsive.highResScale - 1) * 0.9 : 1;
  const scaleDisplay = (value: number) => Math.round(value * iconDisplayScale);
  const sectionHeaderIconSize = scaleDisplay(tierValue(responsive.tier, [36, 40, 46, 54, 66, 82, 100]));
  const sectionTitleIconSize = scaleDisplay(tierValue(responsive.tier, [72, 80, 92, 108, 132, 164, 200]));
  const aboutIconWrapSize = scaleDisplay(tierValue(responsive.tier, [74, 84, 96, 112, 138, 172, 208]));
  const aboutIconSize = scaleDisplay(tierValue(responsive.tier, [58, 66, 78, 92, 114, 144, 176]));
  const scaledIcon = useMemo(
    () => (size: number) => scaledIconSize(size, responsive),
    [responsive]
  );

  const apiBaseUrl = useMemo(() => getApiUrl(), []);
  const lyricsSyncConfig = useMemo(() => resolveLyricsSyncConfig(), []);
  const lyricsSyncFilterLabel = useMemo(() => {
    const filters: string[] = [];
    if (lyricsSyncConfig.source) {
      filters.push(`source=${lyricsSyncConfig.source}`);
    }
    if (lyricsSyncConfig.projectId) {
      filters.push(`projectId=${lyricsSyncConfig.projectId}`);
    }
    return filters.length > 0 ? filters.join(', ') : 'all drafts';
  }, [lyricsSyncConfig.projectId, lyricsSyncConfig.source]);
  const appIconSource =
    Platform.OS === 'web'
      ? require('@/assets/images/web/easeverse_logo_App.web.png')
      : require('@/assets/images/easeverse_logo_App.png');
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
      const response = await apiRequest('GET', buildLyricsSyncRoute(lyricsSyncConfig));
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
          message: `Lyrics synced. No remote lyric drafts found (${lyricsSyncFilterLabel}).`,
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
  }, [
    activeSong?.id,
    lyricsSyncConfig,
    lyricsSyncFilterLabel,
    setActiveSong,
    songs,
    syncingLyrics,
    updateSong,
  ]);

  const handleRefreshLearning = useCallback(async () => {
    setLearningLoading(true);
    try {
      const payload = await fetchLearningRecommendations();
      const rawRecommendations =
        payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        'recommendations' in payload
          ? (payload as { recommendations?: unknown }).recommendations
          : null;

      if (
        !rawRecommendations ||
        typeof rawRecommendations !== 'object' ||
        Array.isArray(rawRecommendations)
      ) {
        setLearningRecommendations(null);
        return;
      }

      const focusWords = Array.isArray((rawRecommendations as { focusWords?: unknown }).focusWords)
        ? ((rawRecommendations as { focusWords: unknown[] }).focusWords
            .filter((value): value is string => typeof value === 'string')
            .slice(0, 6))
        : [];

      const globalChallengeWords = Array.isArray(
        (rawRecommendations as { globalChallengeWords?: unknown }).globalChallengeWords
      )
        ? ((rawRecommendations as { globalChallengeWords: unknown[] }).globalChallengeWords
            .filter((value): value is string => typeof value === 'string')
            .slice(0, 6))
        : [];

      const practicePlan = Array.isArray((rawRecommendations as { practicePlan?: unknown }).practicePlan)
        ? ((rawRecommendations as { practicePlan: unknown[] }).practicePlan
            .reduce<LearningRecommendationsView['practicePlan']>((accumulator, item) => {
              if (!item || typeof item !== 'object' || Array.isArray(item)) {
                return accumulator;
              }
              const row = item as Record<string, unknown>;
              if (typeof row.title !== 'string' || typeof row.reason !== 'string') {
                return accumulator;
              }

              accumulator.push({
                type: row.type === 'timing' ? 'timing' : 'lyrics',
                title: row.title,
                reason: row.reason,
                targetMode: typeof row.targetMode === 'string' ? row.targetMode : undefined,
              });
              return accumulator;
            }, [])
            .slice(0, 5))
        : [];

      setLearningRecommendations({
        focusWords,
        globalChallengeWords,
        practicePlan,
      });
    } catch (error) {
      console.error('Learning recommendations fetch failed:', error);
    } finally {
      setLearningLoading(false);
    }
  }, []);

  useEffect(() => {
    void handleRefreshLearning();
  }, [handleRefreshLearning, sessions.length]);

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
        <View style={{ width: '100%' as const, maxWidth: contentMaxWidth, alignSelf: 'center' as const }}>
        <View style={[styles.statsCard, { marginHorizontal: sectionPadding }]}>
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

        <View style={[styles.section, { paddingHorizontal: sectionPadding }]}>
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
                source={howToIconSource}
                style={[
                  styles.sectionHeaderIcon,
                  {
                    width: sectionHeaderIconSize,
                    height: sectionHeaderIconSize,
                    borderRadius: Math.round(sectionHeaderIconSize * 0.33),
                  },
                ]}
                resizeMode="cover"
                accessible={false}
              />
            </View>
            <Ionicons
              name={howToExpanded ? 'chevron-up' : 'chevron-down'}
              size={scaledIcon(11)}
              color={Colors.textTertiary}
            />
          </Pressable>
          {howToExpanded ? (
            <HowToUseEaseVerse
              onNavigate={(route) => {
                Haptics.selectionAsync();
                router.push(route);
              }}
            />
          ) : (
            <Text style={styles.modeHint}>Tap to expand the quick tour and icon legend.</Text>
          )}
        </View>

        <View style={[styles.section, { paddingHorizontal: sectionPadding }]}>
          <View style={styles.sectionTitleRow}>
            <Image
              source={easePocketIconSource}
              style={[
                styles.sectionTitleIcon,
                {
                  width: sectionTitleIconSize,
                  height: sectionTitleIconSize,
                  borderRadius: Math.round(sectionTitleIconSize * 0.3),
                },
              ]}
              resizeMode="cover"
              accessibilityRole="header"
              accessibilityLabel="EasePocket Timing Trainer"
            />
          </View>
          <View style={styles.settingsCard}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push('/easepocket');
              }}
              style={({ pressed }) => [styles.settingRow, pressed && styles.settingRowPressed]}
              accessibilityRole="button"
              accessibilityLabel="Open EasePocket"
              accessibilityHint="Opens timing training modes like subdivisions, silent beat, and consonant precision"
            >
              <View style={styles.settingLeft}>
                <View style={styles.iconContainer}>
                  <Ionicons name="pulse-outline" size={scaledIcon(11)} color={Colors.gradientStart} />
                </View>
                <Text style={styles.settingLabel}>EasePocket</Text>
              </View>
              <View style={styles.settingRight}>
                <Text style={styles.settingValue}>Timing trainer</Text>
                <Ionicons name="chevron-forward" size={scaledIcon(11)} color={Colors.textTertiary} />
              </View>
            </Pressable>
          </View>
          <Text style={styles.modeHint}>
            Train subdivisions, pocket control, and consonant attacks in milliseconds.
          </Text>
        </View>

        <View style={[styles.section, { paddingHorizontal: sectionPadding }]}>
          <View style={styles.sectionTitleRow}>
            <Image
              source={languageAccentIconSource}
              style={[
                styles.sectionTitleIcon,
                {
                  width: sectionTitleIconSize,
                  height: sectionTitleIconSize,
                  borderRadius: Math.round(sectionTitleIconSize * 0.3),
                },
              ]}
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

        <View style={[styles.section, { paddingHorizontal: sectionPadding }]}>
          <View style={styles.sectionTitleRow}>
            <Image
              source={feedbackHighIconSource}
              style={[
                styles.sectionTitleIcon,
                {
                  width: sectionTitleIconSize,
                  height: sectionTitleIconSize,
                  borderRadius: Math.round(sectionTitleIconSize * 0.3),
                },
              ]}
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

        <View style={[styles.section, { paddingHorizontal: sectionPadding }]}>
          <View style={styles.sectionTitleRow}>
            <Image
              source={liveModeIconSource}
              style={[
                styles.sectionTitleIcon,
                {
                  width: sectionTitleIconSize,
                  height: sectionTitleIconSize,
                  borderRadius: Math.round(sectionTitleIconSize * 0.3),
                },
              ]}
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

        <View style={[styles.section, { paddingHorizontal: sectionPadding }]}>
          <View style={styles.sectionTitleRow}>
            <Image
              source={lyricsFlowSpeedIconSource}
              style={[
                styles.sectionTitleIcon,
                {
                  width: sectionTitleIconSize,
                  height: sectionTitleIconSize,
                  borderRadius: Math.round(sectionTitleIconSize * 0.3),
                },
              ]}
              resizeMode="contain"
              accessibilityRole="header"
              accessibilityLabel="Lyrics Follow Speed"
            />
          </View>
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

        <View style={[styles.section, { paddingHorizontal: sectionPadding }]}>
          <View style={styles.sectionTitleRow}>
            <Image
              source={countInIconSource}
              style={[
                styles.sectionTitleIcon,
                {
                  width: sectionTitleIconSize,
                  height: sectionTitleIconSize,
                  borderRadius: Math.round(sectionTitleIconSize * 0.3),
                },
              ]}
              resizeMode="contain"
              accessibilityRole="header"
              accessibilityLabel="Count-In"
            />
          </View>
          <SegmentedControl<string>
            options={[
              { key: '0', label: 'None' },
              { key: '2', label: '2 beats', iconImage: twoBeatsIconSource },
              { key: '4', label: '4 beats', iconImage: fourBeatsIconSource, iconScale: 1.22 },
            ]}
            value={String(settings.countIn)}
            onChange={v => updateSettings({ countIn: Number(v) as 0 | 2 | 4 })}
          />
        </View>

        <View style={[styles.section, { paddingHorizontal: sectionPadding }]}>
          <View style={styles.sectionTitleRow}>
            <Image
              source={require('@/assets/images/icon-set/Mindfullness_voice.png')}
              style={[
                styles.sectionTitleIcon,
                {
                  width: sectionTitleIconSize,
                  height: sectionTitleIconSize,
                  borderRadius: Math.round(sectionTitleIconSize * 0.3),
                },
              ]}
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

        <View style={[styles.section, { paddingHorizontal: sectionPadding }]}>
          <View style={styles.sectionTitleRow}>
            <Image
              source={require('@/assets/images/icon-set/Lyrics_sync.png')}
              style={[
                styles.sectionTitleIcon,
                {
                  width: sectionTitleIconSize,
                  height: sectionTitleIconSize,
                  borderRadius: Math.round(sectionTitleIconSize * 0.3),
                },
              ]}
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

          <Text style={styles.modeHint}>
            Active filters: {lyricsSyncFilterLabel}.
          </Text>

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

        <View style={[styles.section, { paddingHorizontal: sectionPadding }]}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Smart Practice</Text>
          <View style={styles.settingsCard}>
            <SettingRow
              icon="cpu"
              label="Refresh Recommendations"
              value={learningLoading ? 'Analyzing...' : 'Run now'}
              onPress={learningLoading ? undefined : () => void handleRefreshLearning()}
              accessibilityHint="Uses your latest sessions and timing drills to generate practice suggestions"
            />
            <View style={styles.divider} />
            <SettingRow
              icon="target"
              label="Focus Words"
              value={String(learningRecommendations?.focusWords.length ?? 0)}
            />
            <View style={styles.divider} />
            <SettingRow
              icon="activity"
              label="Practice Plan"
              value={String(learningRecommendations?.practicePlan.length ?? 0)}
            />
          </View>

          {learningRecommendations && (
            <View style={styles.learningCard}>
              {learningRecommendations.focusWords.length > 0 && (
                <View style={styles.learningBlock}>
                  <Text style={styles.learningTitle}>Priority words</Text>
                  <View style={styles.learningTagRow}>
                    {learningRecommendations.focusWords.map((word) => (
                      <View key={word} style={styles.learningTag}>
                        <Text style={styles.learningTagText}>{word}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {learningRecommendations.globalChallengeWords.length > 0 && (
                <View style={styles.learningBlock}>
                  <Text style={styles.learningTitle}>Global challenge words</Text>
                  <Text style={styles.learningHint}>
                    {learningRecommendations.globalChallengeWords.join(', ')}
                  </Text>
                </View>
              )}

              {learningRecommendations.practicePlan.length > 0 && (
                <View style={styles.learningBlock}>
                  <Text style={styles.learningTitle}>Next drills</Text>
                  {learningRecommendations.practicePlan.map((item, index) => (
                    <Text key={`${item.title}-${index}`} style={styles.learningPlanLine}>
                      {index + 1}. {item.title} - {item.reason}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

	        <View style={[styles.section, { paddingHorizontal: sectionPadding }]}>
            <View style={styles.sectionTitleRow}>
              <Image
                source={aboutIconSource}
                style={[
                  styles.sectionTitleIcon,
                  {
                    width: sectionTitleIconSize,
                    height: sectionTitleIconSize,
                    borderRadius: Math.round(sectionTitleIconSize * 0.3),
                  },
                ]}
                resizeMode="contain"
                accessibilityRole="header"
                accessibilityLabel="About"
              />
            </View>
	          <View style={styles.aboutCard}>
	            <View style={styles.aboutRow}>
	              <View
                  style={[
                    styles.aboutIconWrap,
                    {
                      width: aboutIconWrapSize,
                      height: aboutIconWrapSize,
                      borderRadius: Math.round(aboutIconWrapSize * 0.3),
                    },
                  ]}
                >
	                <Image
	                  source={appIconSource}
	                  style={[
                      styles.aboutIcon,
                      { width: aboutIconSize, height: aboutIconSize },
                    ]}
	                  resizeMode="contain"
	                  accessibilityRole="image"
	                  accessibilityLabel="EaseVerse app icon"
	                />
	              </View>
	              <View style={styles.aboutCopy}>
	                <Text style={styles.aboutTitle}>EaseVerse</Text>
	                <Text style={styles.aboutText}>
	                  A complete vocal training system that removes cognitive resistance between thought and expression. From handwritten lyrics to millisecond-precise timing analysis.
	                </Text>
	              </View>
	            </View>
	            
	            <Text style={[styles.aboutSectionTitle, { marginTop: 20 }]}>Core Features</Text>
	            <View style={styles.aboutHighlights}>
	              <View style={styles.aboutHighlightRow}>
	                <Ionicons name="musical-notes-outline" size={scaledIcon(9)} color={Colors.gradientStart} />
	                <Text style={styles.aboutHighlightText}>Live lyric tracking with BPM-synced count-in and metronome</Text>
	              </View>
	              <View style={styles.aboutHighlightRow}>
	                <Ionicons name="document-text-outline" size={scaledIcon(9)} color={Colors.gradientStart} />
	                <Text style={styles.aboutHighlightText}>Smart lyrics editor with auto-save, section parsing, and 16 genre profiles</Text>
	              </View>
	              <View style={styles.aboutHighlightRow}>
	                <Ionicons name="pulse-outline" size={scaledIcon(9)} color={Colors.gradientStart} />
	                <Text style={styles.aboutHighlightText}>EasePocket: 5 timing modes (Subdivision, Silent Beat, Consonant, Pocket, Slow Mastery)</Text>
	              </View>
	              <View style={styles.aboutHighlightRow}>
	                <Ionicons name="trophy-outline" size={scaledIcon(9)} color={Colors.gradientStart} />
	                <Text style={styles.aboutHighlightText}>Session scoring with pronunciation coaching and practice loop for difficult phrases</Text>
	              </View>
	              <View style={styles.aboutHighlightRow}>
	                <Ionicons name="create-outline" size={scaledIcon(9)} color={Colors.gradientStart} />
	                <Text style={styles.aboutHighlightText}>iPad Apple Pencil: Handwriting → text conversion (Scribble) + visual annotations (Ink On)</Text>
	              </View>
	              <View style={styles.aboutHighlightRow}>
	                <Ionicons name="sync-outline" size={scaledIcon(9)} color={Colors.gradientStart} />
	                <Text style={styles.aboutHighlightText}>Real-time collaboration with WebSocket sync and line-by-line diff visualization</Text>
	              </View>
	              <View style={styles.aboutHighlightRow}>
	                <Ionicons name="sparkles-outline" size={scaledIcon(9)} color={Colors.gradientStart} />
	                <Text style={styles.aboutHighlightText}>Warm Up exercises + Mindfulness sessions with AI-powered narration</Text>
	              </View>
	            </View>
	            
	            <Text style={styles.aboutSectionTitle}>AI Technology Stack</Text>
	            <View style={styles.aboutHighlights}>
	              <View style={styles.aboutHighlightRow}>
	                <Ionicons name="logo-google" size={scaledIcon(9)} color={Colors.gradientStart} />
	                <Text style={styles.aboutHighlightText}>Gemini 2.5 Flash: Pronunciation coaching with 1M requests/day capacity</Text>
	              </View>
	              <View style={styles.aboutHighlightRow}>
	                <Ionicons name="mic-outline" size={scaledIcon(9)} color={Colors.gradientStart} />
	                <Text style={styles.aboutHighlightText}>Whisper STT: Local speech-to-text transcription</Text>
	              </View>
	              <View style={styles.aboutHighlightRow}>
	                <Ionicons name="volume-high-outline" size={scaledIcon(9)} color={Colors.gradientStart} />
	                <Text style={styles.aboutHighlightText}>ElevenLabs TTS: Premium voice synthesis for pronunciation playback</Text>
	              </View>
	              <View style={styles.aboutHighlightRow}>
	                <Ionicons name="analytics-outline" size={scaledIcon(9)} color={Colors.gradientStart} />
	                <Text style={styles.aboutHighlightText}>ML Learning Engine: Adaptive recommendations based on practice patterns</Text>
	              </View>
	            </View>
	            
	            <Text style={styles.aboutSectionTitle}>iPad Exclusive Features</Text>
	            <View style={styles.aboutHighlights}>
	              <View style={styles.aboutHighlightRow}>
	                <Ionicons name="create" size={scaledIcon(9)} color={Colors.gradientStart} />
	                <Text style={styles.aboutHighlightText}>Paper Mode: 36 lined guides (34px spacing) for natural handwriting</Text>
	              </View>
	              <View style={styles.aboutHighlightRow}>
	                <Ionicons name="albums-outline" size={scaledIcon(9)} color={Colors.gradientStart} />
	                <Text style={styles.aboutHighlightText}>iOS Scribble Integration: Automatic handwriting-to-text conversion</Text>
	              </View>
	              <View style={styles.aboutHighlightRow}>
	                <Ionicons name="brush" size={scaledIcon(9)} color={Colors.gradientStart} />
	                <Text style={styles.aboutHighlightText}>Ink On: Pen (6 colors, 4 widths), Highlighter, Eraser with pressure sensitivity</Text>
	              </View>
	              <View style={styles.aboutHighlightRow}>
	                <Ionicons name="refresh-circle-outline" size={scaledIcon(9)} color={Colors.gradientStart} />
	                <Text style={styles.aboutHighlightText}>60-state undo/redo for drawings, stylus priority mode, session persistence</Text>
	              </View>
	            </View>
	          </View>

	          <View style={styles.settingsCard}>
	            <SettingRow icon="info" label="Version" value="1.0.0 (Feb 2026)" />
	            <View style={styles.divider} />
	            <SettingRow icon="globe" label="API Server" value={apiHost || 'Unknown'} />
	            <View style={styles.divider} />
	            <SettingRow icon="code" label="Frontend" value="React Native + Expo" />
	            <View style={styles.divider} />
	            <SettingRow icon="cpu" label="Backend" value="Node.js + Express" />
	            <View style={styles.divider} />
	            <SettingRow icon="zap" label="AI Coaching" value="Gemini 2.5 Flash" />
	            <View style={styles.divider} />
	            <SettingRow icon="mic" label="Speech-to-Text" value="Whisper Base EN" />
	            <View style={styles.divider} />
	            <SettingRow icon="speaker" label="Text-to-Speech" value="ElevenLabs" />
	            <View style={styles.divider} />
	            <SettingRow icon="activity" label="Timing Engine" value="EasePocket v1" />
	            <View style={styles.divider} />
	            <SettingRow icon="bar-chart" label="ML Learning" value="Rule-based Adaptive" />
	            <View style={styles.divider} />
	            <SettingRow icon="edit" label="iPad Pencil" value="Scribble + Ink On" />
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
  aboutHighlights: {
    marginTop: 12,
    gap: 8,
  },
  aboutHighlightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  aboutHighlightText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Inter_500Medium',
  },
  aboutSectionTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 16,
    marginBottom: 8,
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
  learningCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    padding: 12,
    gap: 12,
  },
  learningBlock: {
    gap: 8,
  },
  learningTitle: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  learningHint: {
    color: Colors.textTertiary,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Inter_400Regular',
  },
  learningTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  learningTag: {
    backgroundColor: Colors.accentSubtle,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  learningTagText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  learningPlanLine: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Inter_400Regular',
  },
});
