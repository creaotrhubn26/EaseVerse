import React, { ComponentProps, useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Platform,
  Text,
  View,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Linking,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import Toast from '@/components/Toast';
import HowToUseEaseVerse from '@/components/HowToUseEaseVerse';
import { AccountSection } from '@/components/AccountSection';
import { CostDashboardCard } from '@/components/CostDashboardCard';
import { AUTH_CONFIGURED, useAppUser } from '@/lib/use-app-user';
import { apiRequest, getApiUrl } from '@/lib/query-client';
import { parseSongSections } from '@/lib/lyrics-sections';
import { fetchLearningRecommendations } from '@/lib/learning-client';
import { useResponsiveLayout } from '@/lib/responsive';
import { useAuth } from '@/lib/creatorhub-auth';
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

function SettingRow({icon,label,value,onPress,accessibilityHint}: {
  icon: ComponentProps<typeof Feather>['name'];label:string;value:string;onPress?:()=>void;accessibilityHint?:string;
}) {
  const content=<><View style={styles.iconContainer}><Feather name={icon} size={18} color={Colors.gradientMid}/></View>
    <View style={styles.settingCopy}><Text style={styles.settingLabel}>{label}</Text><Text style={styles.settingValue}>{value}</Text></View>
    {onPress&&<Ionicons name="chevron-forward" size={18} color={Colors.textTertiary}/>}</>;
  return onPress?<Pressable style={({pressed})=>[styles.settingRow,pressed&&styles.settingRowPressed]} onPress={onPress}
    accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} accessibilityHint={accessibilityHint}>{content}</Pressable>
    :<View style={styles.settingRow}>{content}</View>;
}
function SegmentedControl<T extends string>({options,value,onChange}: {
 options:{key:T;label:string}[];value:T;onChange:(key:T)=>void;
}) {
 return <View style={styles.segmented}>{options.map(opt=><Pressable key={opt.key}
  style={[styles.segment,value===opt.key&&styles.segmentActive]} onPress={()=>{onChange(opt.key);void Haptics.selectionAsync();}}
  accessibilityRole="button" accessibilityLabel={`${opt.label} option`} accessibilityState={{selected:value===opt.key}} aria-pressed={value===opt.key}>
  <Text style={[styles.segmentText,value===opt.key&&styles.segmentTextActive]}>{opt.label}</Text>
 </Pressable>)}</View>;
}
function ProfileGroup({title,summary,icon,children}: {title:string;summary:string;icon:ComponentProps<typeof Ionicons>['name'];children:React.ReactNode}) {
 const [expanded,setExpanded]=useState(false);
 return <View style={styles.group}>
  <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{expanded}} aria-expanded={expanded}
   accessibilityHint={`${summary}. ${expanded?'Collapse':'Expand'} settings`}
   onPress={()=>setExpanded(value=>!value)} style={({pressed})=>[styles.groupHeader,pressed&&styles.settingRowPressed]}>
   <View style={styles.groupIcon}><Ionicons name={icon} size={21} color={Colors.gradientMid}/></View>
   <View style={styles.settingCopy}><Text style={styles.groupTitle}>{title}</Text><Text style={styles.groupSummary}>{summary}</Text></View>
   <Ionicons name={expanded?'chevron-up':'chevron-down'} size={18} color={Colors.textTertiary}/>
  </Pressable>
  {expanded&&<View style={styles.groupBody}>{children}</View>}
 </View>;
}
function Preference({title,hint,children}: {title:string;hint?:string;children:React.ReactNode}) {
 return <View style={styles.preference}><Text accessibilityRole="header" style={styles.preferenceTitle}>{title}</Text>{children}{hint&&<Text style={styles.modeHint}>{hint}</Text>}</View>;
}

function CompanionLinkRow({ sectionPadding }: { sectionPadding: number }) {
  return (
    <Pressable
      onPress={() => router.push('/companion')}
      style={({ pressed }) => [
        {
          marginHorizontal: sectionPadding,
          marginTop: 12,
          padding: 14,
          borderRadius: 14,
          backgroundColor: Colors.surface,
          borderWidth: 1,
          borderColor: Colors.borderGlass,
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          gap: 10,
        },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Download Pro Tools companion"
    >
      <Ionicons name="cloud-download" size={18} color={Colors.gradientMid} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: Colors.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 14 }}>
          Pro Tools connection
        </Text>
        <Text style={{ color: Colors.textTertiary, fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 2 }}>
          Explore the desktop connection and setup guide.
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
    </Pressable>
  );
}

function ProjectsLinkRow({ sectionPadding }: { sectionPadding: number }) {
  return (
    <Pressable
      onPress={() => router.push('/projects')}
      style={({ pressed }) => [
        {
          marginHorizontal: sectionPadding,
          marginTop: 12,
          padding: 14,
          borderRadius: 14,
          backgroundColor: Colors.surface,
          borderWidth: 1,
          borderColor: Colors.borderGlass,
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          gap: 10,
        },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Open projects"
    >
      <Ionicons name="people" size={18} color={Colors.gradientMid} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: Colors.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 14 }}>
          Studio projects
        </Text>
        <Text style={{ color: Colors.textTertiary, fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 2 }}>
          Invite your band, share takes, vote on keepers.
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
    </Pressable>
  );
}

function AdminLinkRow({ sectionPadding }: { sectionPadding: number }) {
  const { user } = useAppUser();
  if (!user || user.status !== 'admin') return null;
  return (
    <Pressable
      onPress={() => router.push('/admin')}
      style={({ pressed }) => [
        {
          marginHorizontal: sectionPadding,
          marginTop: 12,
          padding: 14,
          borderRadius: 14,
          backgroundColor: Colors.surface,
          borderWidth: 1,
          borderColor: Colors.gradientStart + '55',
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          gap: 10,
        },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Open admin dashboard"
    >
      <Ionicons name="shield-checkmark" size={18} color={Colors.gradientStart} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: Colors.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 14 }}>
          Admin dashboard
        </Text>
        <Text style={{ color: Colors.textTertiary, fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 2 }}>
          Manage users, approvals and usage.
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const {isSignedIn}=useAuth();
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
  const [choice,setChoice]=useState<'language'|'accent'|null>(null);
  const [learningError,setLearningError]=useState('');
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

  const sectionPadding=responsive.contentPadding;
  const contentMaxWidth=responsive.contentMaxWidth;
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

  const handleOpenPrivacy = useCallback(() => {
    router.push('/privacy');
  }, []);

  const handleOpenAccountDeletion = useCallback(() => {
    router.push('/account-deletion');
  }, []);

  const totalDuration=sessions.reduce((sum,item)=>sum+(Number.isFinite(item.duration)?Math.max(0,item.duration):0),0);
  const languages=['English','Norwegian','Swedish','Danish','Finnish','Icelandic','Spanish','French','German','Italian','Portuguese','Japanese','Korean'];
  const accents=['US','UK','AU','Standard'];
  const formatDuration = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return secs<60?`${Math.floor(secs)}s`:`${m}m`;
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
    if(learningLoading)return;
    setLearningLoading(true);setLearningError('');
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
        setLearningRecommendations(null);setLearningError('Practice suggestions are unavailable. Try again later.');
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
    } catch {
      setLearningError('Could not load practice suggestions. Please try again.');
    } finally {
      setLearningLoading(false);
    }
  }, [learningLoading]);

  const sortedSyncChanges = useMemo(
    () =>
      [...syncChanges].sort((a, b) => {
        const aTime = parseIsoTimestampMs(a.updatedAt);
        const bTime = parseIsoTimestampMs(b.updatedAt);
        return bTime - aTime;
      }),
    [syncChanges]
  );

  return <View style={[styles.container,{paddingTop:insets.top}]}>
    <Toast visible={toast.visible} message={toast.message} variant={toast.variant??'info'}
      sound={toast.variant==='success'&&toast.message.startsWith('Synced latest lyrics.')?'lyricsUpdated':'none'}
      onHide={()=>setToast(current=>({...current,visible:false}))}/>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:Math.max(insets.bottom,20)+110}}>
      <View style={{width:'100%',maxWidth:contentMaxWidth,alignSelf:'center',paddingHorizontal:sectionPadding,gap:14}}>
        <View style={styles.profileHeader}>
          <Image source={require('@/assets/images/profile-studio-controls-amber-v1.jpg')} style={styles.profileArt} accessible={false}/>
          <View style={styles.settingCopy}><Text accessibilityRole="header" style={styles.profileTitle}>Profile</Text><Text style={styles.profileSubtitle}>Your voice. Your way of working.</Text></View>
        </View>
        <AccountSection horizontalMargin={0}/>
        <View style={styles.localSummary}>
          <Text accessibilityRole="header" style={styles.preferenceTitle}>On this device</Text>
          <View style={styles.localStats}>
            {[{label:'Songs',value:songs.length},{label:'Takes',value:sessions.length},{label:'Recorded',value:formatDuration(totalDuration)}].map(item=><View key={item.label} style={styles.statItem}><Text style={styles.statValue}>{item.value}</Text><Text style={styles.statLabel}>{item.label}</Text></View>)}
          </View>
          <Text style={styles.modeHint}>Local songs and recordings are separate from shared studio projects.</Text>
        </View>
        <Text accessibilityRole="header" style={styles.menuHeading}>Make it yours</Text>
        <ProfileGroup title="Voice & language" summary={`${settings.language} · ${settings.accentGoal} · ${settings.feedbackIntensity} feedback`} icon="mic-outline">
          <View style={styles.settingsCard}>
            <SettingRow icon="globe" label="Language" value={settings.language} onPress={()=>setChoice('language')} accessibilityHint="Choose the language you practice in"/>
            <View style={styles.divider}/><SettingRow icon="mic" label="Accent Goal" value={settings.accentGoal} onPress={()=>setChoice('accent')} accessibilityHint="Choose your pronunciation practice target"/>
          </View>
          <Text style={styles.modeHint}>These are practice settings. They do not change the app language.</Text>
          <Preference title="Feedback intensity" hint="Choose how much feedback appears during practice.">
            <SegmentedControl<FeedbackIntensity> options={[{key:'low',label:'Low'},{key:'medium',label:'Medium'},{key:'high',label:'High'}]} value={settings.feedbackIntensity} onChange={v=>updateSettings({feedbackIntensity:v})}/>
          </Preference>
          <Preference title="Guidance voice" hint="Used by mindfulness guidance. A producer’s session warmup can have its own recorded voice.">
            <SegmentedControl<NarrationVoice> options={[{key:'female',label:'Female'},{key:'male',label:'Male'}]} value={settings.narrationVoice} onChange={v=>updateSettings({narrationVoice:v})}/>
          </Preference>
        </ProfileGroup>
        <ProfileGroup title="Recording & timing" summary={`${settings.countIn?settings.countIn+'-beat count-in':'No count-in'} · ${settings.lyricsFollowSpeed} lyric tracking`} icon="options-outline">
          <Preference title="Cloud practice analysis" hint="Optional. When enabled, recordings, lyrics and practice history are sent to EaseVerse for analysis. Transcription may use OpenAI. Turn it off to keep new local takes out of cloud analysis. Sharing a studio take is a separate action.">
            <Pressable accessibilityRole="switch" accessibilityLabel="Cloud practice analysis"
              accessibilityState={{checked:settings.cloudAnalysisEnabled===true}}
              {...(Platform.OS==='web'?{'aria-checked':settings.cloudAnalysisEnabled===true}:{})}
              onPress={()=>updateSettings({cloudAnalysisEnabled:settings.cloudAnalysisEnabled!==true})}
              style={{minHeight:48,padding:14,borderRadius:12,backgroundColor:Colors.surface}}>
              <Text style={{color:Colors.textPrimary}}>{settings.cloudAnalysisEnabled?'On — cloud analysis enabled':'Off — local practice only'}</Text>
            </Pressable>
          </Preference>
          <Preference title="Live recognition" hint={settings.liveMode==='stability'?'Waits for more confident recognition before advancing.':'Updates sooner; recognition may be less certain.'}>
            <SegmentedControl<LiveMode> options={[{key:'stability',label:'Stability'},{key:'speed',label:'Speed'}]} value={settings.liveMode} onChange={v=>updateSettings({liveMode:v})}/>
          </Preference>
          <Preference title="Lyrics follow speed" hint="How quickly the highlighted word advances in live tracking.">
            <SegmentedControl<LyricsFollowSpeed> options={[{key:'slow',label:'Slow'},{key:'normal',label:'Normal'},{key:'fast',label:'Fast'}]} value={settings.lyricsFollowSpeed} onChange={v=>updateSettings({lyricsFollowSpeed:v})}/>
          </Preference>
          <Preference title="Count-in" hint="Uses the BPM set on your song.">
            <SegmentedControl options={[{key:'0',label:'None'},{key:'2',label:'2 beats'},{key:'4',label:'4 beats'}]} value={String(settings.countIn)} onChange={v=>updateSettings({countIn:Number(v) as 0|2|4})}/>
          </Preference>
          <Preference title="Metronome vibration" hint="Vibration is available on supported devices.">
            <SegmentedControl options={[{key:'off',label:'Click only'},{key:'on',label:'Click + Vibrate'}]} value={settings.metronomeHaptics?'on':'off'} onChange={v=>updateSettings({metronomeHaptics:v==='on'})}/>
          </Preference>
          <SettingRow icon="activity" label="EasePocket" value="Timing practice" onPress={()=>router.push('/easepocket')} accessibilityHint="Opens the timing practice tools"/>
        </ProfileGroup>
        <ProfileGroup title="Studio & lyrics" summary="Sound Room projects, shared lyrics and Pro Tools" icon="people-outline">
          {AUTH_CONFIGURED&&<ProjectsLinkRow sectionPadding={0}/>}
          <CompanionLinkRow sectionPadding={0}/>
          <Text style={styles.modeHint}>Signing in gives access to shared studio material. It does not automatically upload your local recordings.</Text>
          <Text accessibilityRole="header" style={styles.preferenceTitle}>Lyrics Sync</Text>
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

        </ProfileGroup>
        <ProfileGroup title="Practice suggestions" summary="Find words and phrases to work on next" icon="sparkles-outline">
          <Text style={styles.modeHint}>Request suggestions from your recent practice when you want them.</Text>
          <SettingRow icon="refresh-cw" label="Refresh Recommendations" value={learningLoading?'Loading…':'Run now'} onPress={learningLoading?undefined:()=>void handleRefreshLearning()}/>
          {learningLoading&&<ActivityIndicator accessibilityLabel="Loading practice suggestions" color={Colors.gradientMid}/>}
          {!!learningError&&<Text accessibilityRole="alert" style={styles.errorText}>{learningError}</Text>}
          {learningRecommendations&&!learningRecommendations.focusWords.length&&!learningRecommendations.practicePlan.length&&<Text style={styles.modeHint}>No suggestions yet. Save a take and try again.</Text>}
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

        </ProfileGroup>
        <ProfileGroup title="Help & privacy" summary="Quick tour, app information and your data" icon="help-circle-outline">
          <Text accessibilityRole="header" style={styles.preferenceTitle}>How To Use</Text>
          <HowToUseEaseVerse onNavigate={route=>router.push(route)}/>
          <View style={styles.aboutCard}>
            <Text style={styles.aboutTitle}>EaseVerse</Text><Text style={styles.aboutText}>Write lyrics, capture vocal ideas and work with your producer through Sound Room.</Text>
            <Text style={styles.modeHint}>Version {Constants.expoConfig?.version??'Unknown'}</Text>
          </View>
          <SettingRow icon="shield" label="Privacy Policy" value="Read" onPress={handleOpenPrivacy}/>
          <SettingRow icon="trash-2" label="Delete account & data" value="View request options" onPress={handleOpenAccountDeletion} accessibilityHint="Opens information about requesting deletion; no data is deleted here"/>
          <ProfileGroup title="Technical details" summary="Service address and API documents" icon="code-slash-outline">
            <SettingRow icon="globe" label="API Server" value={apiHost||'Unknown'}/>
            <SettingRow icon="link" label="API Catalog" value="Open" onPress={handleOpenApiCatalog}/>
            <SettingRow icon="file-text" label="OpenAPI Spec" value="Open" onPress={handleOpenOpenApiJson}/>
          </ProfileGroup>
        </ProfileGroup>
        {AUTH_CONFIGURED&&isSignedIn&&<ProfileGroup title="Usage & administration" summary="Usage details and authorized account tools" icon="bar-chart-outline">
          <AdminLinkRow sectionPadding={0}/><CostDashboardCard horizontalMargin={0}/>
        </ProfileGroup>}
      </View>
    </ScrollView>
    <Modal visible={choice!==null} transparent animationType="fade" onRequestClose={()=>setChoice(null)}>
      <View style={styles.modalOverlay}><View style={styles.choiceDialog} accessibilityViewIsModal>
        <Text accessibilityRole="header" style={styles.groupTitle}>{choice==='language'?'Practice language':'Accent goal'}</Text>
        <ScrollView>{(choice==='language'?languages:accents).map(value=>{
          const selected=value===(choice==='language'?settings.language:settings.accentGoal);
          return <Pressable key={value} accessibilityRole="radio" accessibilityLabel={value} accessibilityState={{checked:selected}} aria-checked={selected}
            onPress={()=>{updateSettings(choice==='language'?{language:value}:{accentGoal:value});setChoice(null);}}
            style={[styles.choiceRow,selected&&styles.segmentActive]}>
            <Text style={styles.preferenceTitle}>{value}</Text><Ionicons name={selected?'radio-button-on':'radio-button-off'} size={22} color={selected?Colors.gradientMid:Colors.textTertiary}/>
          </Pressable>;
        })}</ScrollView>
        <Pressable onPress={()=>setChoice(null)} accessibilityRole="button" style={styles.choiceCancel}><Text style={styles.preferenceTitle}>Cancel</Text></Pressable>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  profileHeader:{flexDirection:'row',alignItems:'center',gap:14,paddingVertical:20},profileArt:{width:58,height:58,borderRadius:18},profileTitle:{fontSize:30,lineHeight:38,color:Colors.textPrimary,fontFamily:'Inter_700Bold'},profileSubtitle:{fontSize:12,lineHeight:19,color:Colors.textTertiary},
  settingCopy:{flex:1,minWidth:0,gap:3},menuHeading:{fontSize:18,color:Colors.textPrimary,fontFamily:'Inter_600SemiBold',marginTop:8},
  group:{borderRadius:18,borderWidth:1,borderColor:Colors.borderGlass,backgroundColor:Colors.surface,overflow:'hidden'},
  groupHeader:{minHeight:82,padding:16,flexDirection:'row',alignItems:'center',gap:12},groupIcon:{width:36,height:36,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:Colors.accentSubtle},groupTitle:{fontSize:16,lineHeight:23,color:Colors.textPrimary,fontFamily:'Inter_600SemiBold'},groupSummary:{fontSize:12,lineHeight:18,color:Colors.textTertiary},groupBody:{padding:14,paddingTop:4,gap:18},
  preference:{gap:10},preferenceTitle:{fontSize:14,lineHeight:21,color:Colors.textPrimary,fontFamily:'Inter_600SemiBold'},localSummary:{padding:18,borderRadius:18,backgroundColor:Colors.surfaceGlass,borderWidth:1,borderColor:Colors.borderGlass,gap:14},localStats:{flexDirection:'row',gap:12},
  errorText:{fontSize:13,lineHeight:20,color:Colors.dangerUnderline},modalOverlay:{flex:1,justifyContent:'center',backgroundColor:'rgba(0,0,0,0.72)',padding:20},choiceDialog:{maxHeight:'85%',width:'100%',maxWidth:420,alignSelf:'center',padding:20,borderRadius:22,backgroundColor:Colors.surface,borderWidth:1,borderColor:Colors.borderGlass,gap:16},choiceRow:{minHeight:48,padding:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderRadius:10,gap:8},choiceCancel:{minHeight:48,justifyContent:'center',alignItems:'center',borderWidth:1,borderColor:Colors.borderGlass,borderRadius:12},
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
    minHeight:60,
    gap:12,
  },
  settingRowPressed: {
    backgroundColor: 'rgba(255,255,255,0.03)',
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
    fontSize: 14,
    lineHeight:21,
    fontFamily: 'Inter_500Medium',
  },
  settingValue: {
    color: Colors.textTertiary,
    fontSize: 12,
    lineHeight:18,
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
    paddingVertical: 12,
    minHeight:48,
    paddingHorizontal:4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
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
