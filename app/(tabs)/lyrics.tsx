import React, { useState, useCallback, useEffect, useRef, ComponentProps, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { genreList, getGenreProfile, type GenreId } from '@/constants/genres';
import SectionCard from '@/components/SectionCard';
import Toast from '@/components/Toast';
import LogoHeader from '@/components/LogoHeader';
import PencilInkLayer from '@/components/PencilInkLayer';
import LyricsWriterStudio from '@/components/LyricsWriterStudio';
import { useApp } from '@/lib/AppContext';
import * as Storage from '@/lib/storage';
import { parseSongSections } from '@/lib/lyrics-sections';
import { resolveLyricsSyncConfig } from '@/lib/collab-lyrics';
import type { Song, SongSection } from '@/lib/types';
import { scaledIconSize, tierValue, useResponsiveLayout } from '@/lib/responsive';
import {
  buildSectionGoalHints,
  buildLyricsExportText,
  lineNumberToCursorIndex,
} from '@/lib/lyrics-writer-tools';

const bpmIconSource =
  Platform.OS === 'web'
    ? require('@/assets/images/bpm_icon.webp')
    : require('@/assets/images/bpm_icon.png');

const AUTOSAVE_DEBOUNCE_MS = 700;
const TOAST_THROTTLE_MS = 15000;
const PAPER_LINE_HEIGHT = 34;
const PAPER_GUIDE_LINES = Array.from({ length: 36 }, (_, index) => index);

type TabKey = 'write' | 'structure' | 'import' | 'writer';
type InsertSectionOption = {
  type: SongSection['type'];
  label: string;
};

const INSERT_SECTION_OPTIONS: InsertSectionOption[] = [
  { type: 'verse', label: 'Verse' },
  { type: 'pre-chorus', label: 'Pre-Chorus' },
  { type: 'chorus', label: 'Chorus' },
  { type: 'bridge', label: 'Bridge' },
  { type: 'final-chorus', label: 'Final Chorus' },
];

const SECTION_BASE_LABELS: Record<SongSection['type'], string> = {
  verse: 'Verse',
  'pre-chorus': 'Pre-Chorus',
  chorus: 'Chorus',
  bridge: 'Bridge',
  'final-chorus': 'Final Chorus',
  intro: 'Intro',
  outro: 'Outro',
};

const REPEATABLE_SECTION_TYPES = new Set<SongSection['type']>([
  'verse',
  'pre-chorus',
  'chorus',
  'bridge',
]);

const SECTION_HEADER_PATTERN =
  /^(verse|pre[- ]?chorus|chorus|bridge|final[- ]?chorus|intro|outro)(?:\s+(\d+))?$/i;

type SectionAnchor = {
  id: string;
  label: string;
  type: SongSection['type'];
  cursor: number;
};

type TextSelection = {
  start: number;
  end: number;
};

type SaveIndicatorState = 'saved' | 'saving' | 'unsaved' | 'error';

function parseSectionHeaderToken(
  line: string
): { type: SongSection['type']; explicitNumber: number | null } | null {
  let token = line.trim();
  if (!token) {
    return null;
  }

  if (token.startsWith('[') && token.endsWith(']')) {
    token = token.slice(1, -1).trim();
  }
  token = token.replace(/[:\-]+$/, '').trim();

  const match = token.match(SECTION_HEADER_PATTERN);
  if (!match) {
    return null;
  }

  const rawType = match[1].toLowerCase().replace(/\s+/g, '-');
  const type =
    rawType === 'prechorus' || rawType === 'pre-chorus'
      ? 'pre-chorus'
      : rawType === 'finalchorus' || rawType === 'final-chorus'
      ? 'final-chorus'
      : (rawType as SongSection['type']);

  if (!(type in SECTION_BASE_LABELS)) {
    return null;
  }

  const explicitNumber =
    typeof match[2] === 'string' ? Number.parseInt(match[2], 10) : null;

  return {
    type,
    explicitNumber,
  };
}

function buildSectionAnchors(text: string): SectionAnchor[] {
  const rawLines = text.split('\n');
  if (rawLines.length === 0) {
    return [];
  }

  const hasExplicitHeaders = rawLines.some(
    (line) => parseSectionHeaderToken(line) !== null
  );

  if (hasExplicitHeaders) {
    const counters: Record<SongSection['type'], number> = {
      verse: 0,
      'pre-chorus': 0,
      chorus: 0,
      bridge: 0,
      'final-chorus': 0,
      intro: 0,
      outro: 0,
    };

    const anchors: SectionAnchor[] = [];
    let cursor = 0;
    for (let index = 0; index < rawLines.length; index += 1) {
      const line = rawLines[index];
      const header = parseSectionHeaderToken(line);
      if (header) {
        const currentCount =
          header.explicitNumber !== null
            ? header.explicitNumber
            : counters[header.type] + 1;
        counters[header.type] = Math.max(counters[header.type], currentCount);
        const baseLabel = SECTION_BASE_LABELS[header.type];
        const label =
          REPEATABLE_SECTION_TYPES.has(header.type) && currentCount > 1
            ? `${baseLabel} ${currentCount}`
            : baseLabel;

        anchors.push({
          id: `${header.type}-${currentCount}-${cursor}`,
          label,
          type: header.type,
          cursor,
        });
      }
      cursor += line.length + (index < rawLines.length - 1 ? 1 : 0);
    }
    return anchors;
  }

  const nonEmptyLines: { cursor: number }[] = [];
  let cursor = 0;
  for (let index = 0; index < rawLines.length; index += 1) {
    const line = rawLines[index];
    if (line.trim()) {
      nonEmptyLines.push({ cursor });
    }
    cursor += line.length + (index < rawLines.length - 1 ? 1 : 0);
  }

  if (nonEmptyLines.length === 0) {
    return [];
  }

  const anchors: SectionAnchor[] = [];
  let sectionCount = 0;
  let verseCount = 0;
  for (let index = 0; index < nonEmptyLines.length; ) {
    sectionCount += 1;
    const type =
      sectionCount % 3 === 2 ? 'chorus' : sectionCount % 3 === 0 ? 'bridge' : 'verse';

    let label = SECTION_BASE_LABELS[type];
    if (type === 'verse') {
      verseCount += 1;
      label = verseCount > 1 ? `Verse ${verseCount}` : 'Verse';
    }

    anchors.push({
      id: `${type}-${sectionCount}-${nonEmptyLines[index].cursor}`,
      label,
      type,
      cursor: nonEmptyLines[index].cursor,
    });
    index += Math.min(4, nonEmptyLines.length - index);
  }

  return anchors;
}

function clampSelection(selection: TextSelection, textLength: number): TextSelection {
  const start = Math.max(0, Math.min(textLength, selection.start));
  const end = Math.max(start, Math.min(textLength, selection.end));
  return { start, end };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFindMatches(text: string, query: string): TextSelection[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }

  const haystack = text.toLowerCase();
  const matches: TextSelection[] = [];
  let index = 0;
  while (index <= haystack.length - needle.length) {
    const foundIndex = haystack.indexOf(needle, index);
    if (foundIndex === -1) {
      break;
    }
    matches.push({ start: foundIndex, end: foundIndex + needle.length });
    index = foundIndex + Math.max(1, needle.length);
  }

  return matches;
}

function firstLyricLine(lyrics: string): string {
  const line = lyrics
    .split('\n')
    .map((segment) => segment.trim())
    .find((segment) => segment.length > 0);
  return line || 'No lyric lines yet';
}

function formatShortDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default function LyricsScreen() {
  const insets = useSafeAreaInsets();
  const responsive = useResponsiveLayout();
  const isNativeIpad = Platform.OS === 'ios' && Platform.isPad === true;
  const { activeSong, songs, sessions, addSong, updateSong, setActiveSong } = useApp();
  const [activeTab, setActiveTab] = useState<TabKey>('write');
  const [editText, setEditText] = useState(activeSong?.lyrics || '');
  const [importText, setImportText] = useState('');
  const [songTitle, setSongTitle] = useState(activeSong?.title || '');
  const [selectedGenre, setSelectedGenre] = useState<GenreId>(activeSong?.genre || 'pop');
  const [tempoBpmText, setTempoBpmText] = useState(activeSong?.bpm ? String(activeSong.bpm) : '');
  const [paperModeEnabled, setPaperModeEnabled] = useState(isNativeIpad);
  const [focusMode, setFocusMode] = useState(false);
  const [mobileLyricsFocus, setMobileLyricsFocus] = useState(true);
  const [showFindPanel, setShowFindPanel] = useState(false);
  const [showReplacePanel, setShowReplacePanel] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [findMatchIndex, setFindMatchIndex] = useState(-1);
  const [editorSelection, setEditorSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const [editorFocused, setEditorFocused] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; variant?: 'success' | 'error' }>({
    visible: false,
    message: '',
  });
  const [saveIndicatorState, setSaveIndicatorState] = useState<SaveIndicatorState>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(activeSong?.updatedAt ?? null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [lyricsVersions, setLyricsVersions] = useState<Storage.LyricsVersionRecord[]>([]);
  const [lineComments, setLineComments] = useState<Storage.LyricsLineComment[]>([]);
  const [captureInbox, setCaptureInbox] = useState<Storage.LyricsCaptureItem[]>([]);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);
  const lastToastTimeRef = useRef(0);
  const tapTempoRef = useRef<number[]>([]);
  const findCursorRef = useRef(0);
  const editorRef = useRef<TextInput | null>(null);
  const findInputRef = useRef<TextInput | null>(null);

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;
  const horizontalInset = responsive.contentPadding;
  const contentMaxWidth = responsive.contentMaxWidth;
  const sectionWrapStyle = useMemo(
    () => ({ width: '100%' as const, maxWidth: contentMaxWidth, alignSelf: 'center' as const }),
    [contentMaxWidth]
  );
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
  const bpmIconSize = tierValue(responsive.tier, [18, 20, 20, 22, 24, 28, 30]);
  const libraryCardWidth = tierValue(responsive.tier, [170, 188, 208, 236, 268, 320, 360]);
  const scaledIcon = useMemo(
    () => (size: number) => scaledIconSize(size, responsive),
    [responsive]
  );
  const sortedSongs = useMemo(
    () => [...songs].sort((a, b) => b.updatedAt - a.updatedAt),
    [songs]
  );
  const activeSongRecordKey = activeSong?.id ?? 'draft';
  const findMatches = useMemo(
    () => buildFindMatches(editText, findQuery),
    [editText, findQuery]
  );
  const sectionAnchors = useMemo(() => buildSectionAnchors(editText), [editText]);
  const sectionGoalHints = useMemo(() => buildSectionGoalHints(editText), [editText]);
  const draftDirty = useMemo(
    () =>
      editText !== (activeSong?.lyrics || '') ||
      songTitle !== (activeSong?.title || '') ||
      selectedGenre !== (activeSong?.genre || 'pop') ||
      tempoBpmText !== (activeSong?.bpm ? String(activeSong.bpm) : ''),
    [activeSong?.bpm, activeSong?.genre, activeSong?.lyrics, activeSong?.title, editText, selectedGenre, songTitle, tempoBpmText]
  );
  const isDesktopWorkspace = responsive.isWeb && responsive.tier >= 5;
  const isDesktopWriteLayout = isDesktopWorkspace && activeTab === 'write';
  const isDesktopStructureLayout = isDesktopWorkspace && activeTab === 'structure';
  const isDesktopImportLayout = isDesktopWorkspace && activeTab === 'import';
  const isDesktopWriterLayout = isDesktopWorkspace && activeTab === 'writer';
  const showDesktopThreePane = isDesktopWorkspace && (activeTab !== 'write' || !focusMode);
  const isMobileLyricsLayout = !isDesktopWorkspace;
  const isMobileWriteLayout = isMobileLyricsLayout && activeTab === 'write';
  const showTopComposerControls =
    !isDesktopWorkspace && !mobileLyricsFocus;
  const showTopLibrary =
    !isDesktopWorkspace && !mobileLyricsFocus;
  const pencilSessionKey = activeSong?.id || 'draft';
  const saveIndicatorLabel = useMemo(() => {
    if (saveIndicatorState === 'saving') {
      return 'Saving...';
    }
    if (saveIndicatorState === 'unsaved') {
      return 'Unsaved changes';
    }
    if (saveIndicatorState === 'error') {
      return 'Save issue';
    }
    return 'Saved';
  }, [saveIndicatorState]);
  const lastSavedLabel = useMemo(() => {
    if (!lastSavedAt) {
      return 'Not saved yet';
    }
    return `Saved ${new Date(lastSavedAt).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  }, [lastSavedAt]);
  const lastSyncedLabel = useMemo(() => {
    if (!lastSyncedAt) {
      return 'No sync history';
    }
    return `Last sync ${new Date(lastSyncedAt).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  }, [lastSyncedAt]);
  const saveIndicatorBadgeStyle =
    saveIndicatorState === 'saved'
      ? styles.saveBadgeSaved
      : saveIndicatorState === 'saving'
        ? styles.saveBadgeSaving
        : saveIndicatorState === 'error'
          ? styles.saveBadgeError
          : styles.saveBadgeUnsaved;
  const saveIndicatorDotColor =
    saveIndicatorState === 'saved'
      ? Colors.successUnderline
      : saveIndicatorState === 'saving'
        ? Colors.gradientStart
        : saveIndicatorState === 'error'
          ? Colors.dangerUnderline
          : Colors.warningUnderline;
  const desktopWidthScale = responsive.isWeb
    ? 1 + (responsive.highResScale - 1) * 0.72
    : 1;
  const desktopPaneGap = Math.max(
    14,
    Math.round(
      tierValue(responsive.tier, [10, 10, 12, 14, 16, 18, 24]) *
        (responsive.isWeb ? 1 + (responsive.highResScale - 1) * 0.35 : 1)
    )
  );
  const desktopLibraryPaneWidth = Math.round(
    tierValue(responsive.tier, [220, 220, 230, 245, 260, 280, 320]) *
      desktopWidthScale
  );
  const desktopSidePaneWidth = Math.round(
    tierValue(responsive.tier, [250, 250, 260, 280, 300, 320, 360]) *
      desktopWidthScale
  );
  const desktopEditorMinHeight = Math.round(
    tierValue(responsive.tier, [360, 380, 420, 500, 560, 620, 700]) *
      (responsive.isWeb ? 1 + (responsive.highResScale - 1) * 0.32 : 1)
  );
  const desktopPaneMinHeight = Math.round(
    tierValue(responsive.tier, [380, 400, 430, 500, 560, 620, 700]) *
      (responsive.isWeb ? 1 + (responsive.highResScale - 1) * 0.28 : 1)
  );
  const desktopFocusMaxWidth = Math.round(
    tierValue(responsive.tier, [700, 760, 820, 900, 1000, 1120, 1320]) *
      (responsive.isWeb ? 1 + (responsive.highResScale - 1) * 0.3 : 1)
  );
  const sectionNavigatorMaxHeight = Math.round(
    tierValue(responsive.tier, [130, 140, 150, 160, 170, 190, 240]) *
      (responsive.isWeb ? 1 + (responsive.highResScale - 1) * 0.2 : 1)
  );

  React.useEffect(() => {
    setEditText(activeSong?.lyrics || '');
    setSongTitle(activeSong?.title || '');
    setSelectedGenre(activeSong?.genre || 'pop');
    setTempoBpmText(activeSong?.bpm ? String(activeSong.bpm) : '');
    setSaveIndicatorState('saved');
    setLastSavedAt(activeSong?.updatedAt ?? null);
    setEditorSelection({ start: 0, end: 0 });
    setFindMatchIndex(-1);
    findCursorRef.current = 0;
  }, [
    activeSong?.id,
    activeSong?.lyrics,
    activeSong?.title,
    activeSong?.genre,
    activeSong?.bpm,
    activeSong?.updatedAt,
  ]);

  useEffect(() => {
    setEditorSelection((current) => clampSelection(current, editText.length));
  }, [editText.length]);

  useEffect(() => {
    if (!isDesktopWriteLayout && focusMode) {
      setFocusMode(false);
    }
  }, [focusMode, isDesktopWriteLayout]);

  useEffect(() => {
    if (!isNativeIpad && paperModeEnabled) {
      setPaperModeEnabled(false);
    }
  }, [isNativeIpad, paperModeEnabled]);

  useEffect(() => {
    setFindMatchIndex(-1);
  }, [findQuery]);

  useEffect(() => {
    if (findMatchIndex >= findMatches.length) {
      setFindMatchIndex(findMatches.length > 0 ? findMatches.length - 1 : -1);
    }
  }, [findMatchIndex, findMatches.length]);

  useEffect(() => {
    if (isInitialMount.current) {
      return;
    }
    if (draftDirty) {
      setSaveIndicatorState('unsaved');
    }
  }, [draftDirty]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const snapshots = await Storage.getLyricsSnapshots();
      if (cancelled) {
        return;
      }

      if (activeSong?.id) {
        const snapshot = snapshots[activeSong.id];
        setLastSyncedAt(snapshot?.syncedAt ?? null);
      } else {
        setLastSyncedAt(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeSong?.id, songs.length]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [versions, comments, captures] = await Promise.all([
        Storage.getLyricsVersions(activeSongRecordKey),
        Storage.getLyricsLineComments(activeSongRecordKey),
        Storage.getLyricsCaptureInbox(activeSongRecordKey),
      ]);
      if (cancelled) {
        return;
      }
      setLyricsVersions(versions);
      setLineComments(comments);
      setCaptureInbox(captures);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeSongRecordKey]);

  const handleCreateVersionSnapshot = useCallback(
    async (note?: string) => {
      if (!editText.trim()) {
        setToast({ visible: true, message: 'Write lyrics before creating a snapshot.', variant: 'error' });
        return;
      }

      const createdAt = Date.now();
      const nextVersion: Storage.LyricsVersionRecord = {
        id: Storage.generateId(),
        songId: activeSongRecordKey,
        title: songTitle || activeSong?.title || 'Untitled',
        lyrics: editText,
        bpm: tempoBpmText.trim() ? Number.parseInt(tempoBpmText, 10) : activeSong?.bpm,
        createdAt,
        note,
      };

      const latest = lyricsVersions[0];
      if (
        latest &&
        latest.lyrics.trim() === nextVersion.lyrics.trim() &&
        latest.title.trim() === nextVersion.title.trim() &&
        createdAt - latest.createdAt < 90_000 &&
        !note
      ) {
        return;
      }

      const next = [nextVersion, ...lyricsVersions.filter((version) => version.id !== nextVersion.id)].slice(0, 40);
      setLyricsVersions(next);
      await Storage.saveLyricsVersions(activeSongRecordKey, next);
      setToast({ visible: true, message: 'Snapshot added to timeline.' });
    },
    [
      activeSong?.bpm,
      activeSong?.title,
      activeSongRecordKey,
      editText,
      lyricsVersions,
      songTitle,
      tempoBpmText,
    ]
  );

  const handleRestoreVersion = useCallback(
    (versionId: string) => {
      const version = lyricsVersions.find((item) => item.id === versionId);
      if (!version) {
        return;
      }
      setSongTitle(version.title || 'Untitled');
      setEditText(version.lyrics);
      setTempoBpmText(typeof version.bpm === 'number' ? String(version.bpm) : '');
      setSaveIndicatorState('unsaved');
      setActiveTab('write');
      setToast({ visible: true, message: 'Restored snapshot. Save when ready.' });
      Haptics.selectionAsync();
    },
    [lyricsVersions]
  );

  const handleDeleteVersion = useCallback(
    async (versionId: string) => {
      const next = lyricsVersions.filter((version) => version.id !== versionId);
      setLyricsVersions(next);
      await Storage.saveLyricsVersions(activeSongRecordKey, next);
    },
    [activeSongRecordKey, lyricsVersions]
  );

  const handleUpsertLineComment = useCallback(
    async (lineNumber: number, text: string) => {
      const trimmed = text.trim();
      const existing = lineComments.find((comment) => comment.lineNumber === lineNumber);
      const now = Date.now();

      let nextComments: Storage.LyricsLineComment[];
      if (!trimmed) {
        nextComments = lineComments.filter((comment) => comment.lineNumber !== lineNumber);
      } else if (existing) {
        nextComments = lineComments.map((comment) =>
          comment.id === existing.id
            ? { ...comment, text: trimmed, updatedAt: now }
            : comment
        );
      } else {
        nextComments = [
          ...lineComments,
          {
            id: Storage.generateId(),
            lineNumber,
            text: trimmed,
            createdAt: now,
          },
        ];
      }

      setLineComments(nextComments);
      await Storage.saveLyricsLineComments(activeSongRecordKey, nextComments);
    },
    [activeSongRecordKey, lineComments]
  );

  const handleDeleteLineComment = useCallback(
    async (commentId: string) => {
      const next = lineComments.filter((comment) => comment.id !== commentId);
      setLineComments(next);
      await Storage.saveLyricsLineComments(activeSongRecordKey, next);
    },
    [activeSongRecordKey, lineComments]
  );

  const handleAddCapture = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      const next: Storage.LyricsCaptureItem[] = [
        { id: Storage.generateId(), text: trimmed, createdAt: Date.now(), pinned: false },
        ...captureInbox,
      ].slice(0, 40);
      setCaptureInbox(next);
      await Storage.saveLyricsCaptureInbox(activeSongRecordKey, next);
    },
    [activeSongRecordKey, captureInbox]
  );

  const handleToggleCapturePin = useCallback(
    async (captureId: string) => {
      const next = [...captureInbox]
        .map((capture) =>
          capture.id === captureId ? { ...capture, pinned: !capture.pinned } : capture
        )
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
      setCaptureInbox(next);
      await Storage.saveLyricsCaptureInbox(activeSongRecordKey, next);
    },
    [activeSongRecordKey, captureInbox]
  );

  const handleDeleteCapture = useCallback(
    async (captureId: string) => {
      const next = captureInbox.filter((capture) => capture.id !== captureId);
      setCaptureInbox(next);
      await Storage.saveLyricsCaptureInbox(activeSongRecordKey, next);
    },
    [activeSongRecordKey, captureInbox]
  );

  const performSave = useCallback((options?: { silent?: boolean }): boolean => {
    if (!editText.trim()) {
      setSaveIndicatorState('unsaved');
      return true;
    }

    const duplicate = songs.find(s => s.title.toLowerCase() === (songTitle || 'Untitled').toLowerCase() && s.id !== activeSong?.id);
    if (duplicate) {
      setSaveIndicatorState('error');
      setToast({ visible: true, message: 'Duplicate title – choose a different name', variant: 'error' });
      return false;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const sections = parseSongSections(editText);
    const parsedBpm = tempoBpmText.trim()
      ? Math.max(30, Math.min(300, parseInt(tempoBpmText, 10)))
      : undefined;
    const savedAt = Date.now();

    if (activeSong) {
      const updated: Song = {
        ...activeSong,
        title: songTitle || 'Untitled',
        lyrics: editText,
        genre: selectedGenre,
        bpm: parsedBpm,
        sections,
        updatedAt: savedAt,
      };
      updateSong(updated);
      setActiveSong(updated);
    } else {
      const newSong: Song = {
        id: Storage.generateId(),
        title: songTitle || 'Untitled',
        lyrics: editText,
        genre: selectedGenre,
        bpm: parsedBpm,
        sections,
        createdAt: savedAt,
        updatedAt: savedAt,
      };
      addSong(newSong);
      setActiveSong(newSong);
    }

    setSaveIndicatorState('saved');
    setLastSavedAt(savedAt);

    if (!options?.silent) {
      void handleCreateVersionSnapshot('Saved snapshot');
    }

    if (!options?.silent && savedAt - lastToastTimeRef.current >= TOAST_THROTTLE_MS) {
      lastToastTimeRef.current = savedAt;
      setToast({ visible: true, message: 'Saved & ready for live' });
    }
    return true;
  }, [
    activeSong,
    addSong,
    editText,
    selectedGenre,
    setActiveSong,
    songTitle,
    songs,
    tempoBpmText,
    updateSong,
    handleCreateVersionSnapshot,
  ]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    if (!editText.trim()) {
      setSaveIndicatorState('unsaved');
      return;
    }

    autosaveTimerRef.current = setTimeout(() => {
      setSaveIndicatorState('saving');
      const saved = performSave({ silent: true });
      if (!saved) {
        setSaveIndicatorState('error');
      }
      autosaveTimerRef.current = null;
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [editText, songTitle, selectedGenre, tempoBpmText, performSave]);

  const updateEditorContent = useCallback(
    (nextText: string, nextSelection: TextSelection) => {
      const clamped = clampSelection(nextSelection, nextText.length);
      setEditText(nextText);
      setEditorSelection(clamped);
      findCursorRef.current = clamped.end;
    },
    []
  );

  const insertTextAtCursor = useCallback(
    (snippet: string) => {
      if (!snippet) {
        return;
      }
      const selection = clampSelection(editorSelection, editText.length);
      const before = editText.slice(0, selection.start);
      const after = editText.slice(selection.end);
      const nextText = `${before}${snippet}${after}`;
      const cursor = before.length + snippet.length;
      updateEditorContent(nextText, { start: cursor, end: cursor });
      setSaveIndicatorState('unsaved');
      setActiveTab('write');
      Haptics.selectionAsync();
    },
    [editText, editorSelection, updateEditorContent]
  );

  const jumpToLineFromWriter = useCallback(
    (lineNumber: number) => {
      const cursor = lineNumberToCursorIndex(editText, lineNumber);
      setEditorSelection({ start: cursor, end: cursor });
      findCursorRef.current = cursor;
      setActiveTab('write');
      editorRef.current?.focus();
      Haptics.selectionAsync();
    },
    [editText]
  );

  const handleWriterExport = useCallback(
    async (mode: 'copy-clean' | 'copy-rehearsal' | 'download-clean' | 'print') => {
      const cleanText = buildLyricsExportText({
        title: songTitle || activeSong?.title || 'Untitled',
        lyrics: editText,
        genre: getGenreProfile(selectedGenre).label,
        bpm: tempoBpmText.trim() ? Number.parseInt(tempoBpmText, 10) : activeSong?.bpm,
        includeLineNumbers: false,
        includeHeaders: true,
      });
      const rehearsalText = buildLyricsExportText({
        title: songTitle || activeSong?.title || 'Untitled',
        lyrics: editText,
        genre: getGenreProfile(selectedGenre).label,
        bpm: tempoBpmText.trim() ? Number.parseInt(tempoBpmText, 10) : activeSong?.bpm,
        includeLineNumbers: true,
        includeHeaders: true,
      });

      const targetText = mode === 'copy-rehearsal' ? rehearsalText : cleanText;

      if (mode === 'copy-clean' || mode === 'copy-rehearsal') {
        if (
          Platform.OS === 'web' &&
          typeof navigator !== 'undefined' &&
          navigator.clipboard &&
          typeof navigator.clipboard.writeText === 'function'
        ) {
          try {
            await navigator.clipboard.writeText(targetText);
            setToast({ visible: true, message: 'Export copied to clipboard.' });
          } catch {
            setToast({ visible: true, message: 'Clipboard copy failed.', variant: 'error' });
          }
        } else {
          setToast({ visible: true, message: 'Clipboard copy is supported on web export.', variant: 'error' });
        }
        return;
      }

      if (mode === 'download-clean') {
        if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
          setToast({ visible: true, message: 'File download is available on web export.', variant: 'error' });
          return;
        }

        const blob = new Blob([targetText], { type: 'text/plain;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        const slug = (songTitle || 'lyrics')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
        link.href = url;
        link.download = `${slug || 'lyrics'}-${Date.now()}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        setToast({ visible: true, message: 'TXT export downloaded.' });
        return;
      }

      if (mode === 'print') {
        if (Platform.OS !== 'web' || typeof window === 'undefined') {
          setToast({ visible: true, message: 'Print/PDF export is available on web.', variant: 'error' });
          return;
        }

        const popup = window.open('', '_blank', 'noopener,noreferrer,width=820,height=900');
        if (!popup) {
          setToast({ visible: true, message: 'Popup blocked. Enable popups to print.', variant: 'error' });
          return;
        }
        const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(songTitle || 'Lyrics')}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; padding: 28px; color: #121622; }
    pre { white-space: pre-wrap; line-height: 1.45; font-size: 14px; }
  </style>
</head>
<body>
  <pre>${escapeHtml(rehearsalText)}</pre>
</body>
</html>`;
        popup.document.open();
        popup.document.write(html);
        popup.document.close();
        popup.focus();
        popup.print();
      }
    },
    [activeSong?.bpm, activeSong?.title, editText, selectedGenre, songTitle, tempoBpmText]
  );

  const handleImport = useCallback(() => {
    if (!importText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateEditorContent(importText, { start: importText.length, end: importText.length });
    setActiveTab('write');
    setImportText('');
  }, [importText, updateEditorContent]);

  const handleInsertSection = useCallback(
    (option: InsertSectionOption) => {
      const label = option.label;
      const selection = clampSelection(editorSelection, editText.length);
      const before = editText.slice(0, selection.start);
      const after = editText.slice(selection.end);
      const needsLeadingBreak =
        before.length > 0 && !before.endsWith('\n\n')
          ? before.endsWith('\n')
            ? '\n'
            : '\n\n'
          : '';
      const needsTrailingBreak = after.length > 0 && !after.startsWith('\n') ? '\n' : '';
      const snippet = `${needsLeadingBreak}[${label}]\n${needsTrailingBreak}`;
      const nextText = `${before}${snippet}${after}`;
      const nextCursor = before.length + snippet.length;

      updateEditorContent(nextText, { start: nextCursor, end: nextCursor });
      Haptics.selectionAsync();
    },
    [editText, editorSelection, updateEditorContent]
  );

  const moveSectionUp = (idx: number) => {
    if (!activeSong || idx === 0) return;
    const sections = [...activeSong.sections];
    [sections[idx - 1], sections[idx]] = [sections[idx], sections[idx - 1]];
    const updated = { ...activeSong, sections, updatedAt: Date.now() };
    updateSong(updated);
    setActiveSong(updated);
    Haptics.selectionAsync();
  };

  const moveSectionDown = (idx: number) => {
    if (!activeSong || idx >= activeSong.sections.length - 1) return;
    const sections = [...activeSong.sections];
    [sections[idx], sections[idx + 1]] = [sections[idx + 1], sections[idx]];
    const updated = { ...activeSong, sections, updatedAt: Date.now() };
    updateSong(updated);
    setActiveSong(updated);
    Haptics.selectionAsync();
  };

  const handleTapTempo = useCallback(() => {
    const now = Date.now();
    const taps = tapTempoRef.current;
    const lastTap = taps.at(-1);
    if (lastTap && now - lastTap > 2000) {
      taps.length = 0;
    }
    taps.push(now);
    while (taps.length > 8) {
      taps.shift();
    }

    if (taps.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < taps.length; i += 1) {
        intervals.push(taps[i] - taps[i - 1]);
      }
      const avg = intervals.reduce((sum, ms) => sum + ms, 0) / intervals.length;
      if (avg > 0) {
        const bpm = Math.round(60000 / avg);
        const clamped = Math.max(30, Math.min(300, bpm));
        setTempoBpmText(String(clamped));
      }
    }

    Haptics.selectionAsync();
  }, []);

  const jumpToSectionAnchor = useCallback(
    (anchor: SectionAnchor) => {
      const cursor = Math.max(0, Math.min(editText.length, anchor.cursor));
      const nextSelection = { start: cursor, end: cursor };
      setEditorSelection(nextSelection);
      findCursorRef.current = cursor;
      editorRef.current?.focus();
      Haptics.selectionAsync();
    },
    [editText.length]
  );

  const indentSelection = useCallback(
    (direction: 'indent' | 'outdent') => {
      const selection = clampSelection(editorSelection, editText.length);
      const lineStart = editText.lastIndexOf('\n', Math.max(0, selection.start - 1)) + 1;
      const lineEndRaw = editText.indexOf('\n', selection.end);
      const lineEnd = lineEndRaw === -1 ? editText.length : lineEndRaw;
      const block = editText.slice(lineStart, lineEnd);
      const lines = block.split('\n');
      const indentToken = '  ';

      const transformedLines = lines.map((line) => {
        if (direction === 'indent') {
          return `${indentToken}${line}`;
        }
        if (line.startsWith(indentToken)) {
          return line.slice(indentToken.length);
        }
        if (line.startsWith('\t')) {
          return line.slice(1);
        }
        return line;
      });

      const nextBlock = transformedLines.join('\n');
      const nextText = `${editText.slice(0, lineStart)}${nextBlock}${editText.slice(lineEnd)}`;
      const lineCount = lines.length;
      const nextSelection =
        direction === 'indent'
          ? {
              start: selection.start + indentToken.length,
              end: selection.end + indentToken.length * lineCount,
            }
          : {
              start: Math.max(lineStart, selection.start - indentToken.length),
              end: Math.max(lineStart, selection.end - indentToken.length * lineCount),
            };

      updateEditorContent(nextText, nextSelection);
    },
    [editText, editorSelection, updateEditorContent]
  );

  const selectFindMatchAtIndex = useCallback(
    (targetIndex: number): TextSelection | null => {
      if (findMatches.length === 0) {
        return null;
      }

      const normalizedIndex =
        ((targetIndex % findMatches.length) + findMatches.length) % findMatches.length;
      const match = findMatches[normalizedIndex];
      setEditorSelection(match);
      setFindMatchIndex(normalizedIndex);
      findCursorRef.current = match.end;
      editorRef.current?.focus();
      return match;
    },
    [findMatches]
  );

  const resolveFindIndexFromSelection = useCallback((): number => {
    if (findMatches.length === 0) {
      return -1;
    }

    const selection = clampSelection(editorSelection, editText.length);
    const exactIndex = findMatches.findIndex(
      (match) => match.start === selection.start && match.end === selection.end
    );
    if (exactIndex >= 0) {
      return exactIndex;
    }

    const nextIndex = findMatches.findIndex((match) => match.start >= selection.end);
    return nextIndex >= 0 ? nextIndex : 0;
  }, [editText.length, editorSelection, findMatches]);

  const selectNextFindMatch = useCallback((): TextSelection | null => {
    if (findMatches.length === 0) {
      return null;
    }

    if (findMatchIndex >= 0) {
      return selectFindMatchAtIndex(findMatchIndex + 1);
    }

    return selectFindMatchAtIndex(resolveFindIndexFromSelection());
  }, [findMatchIndex, findMatches.length, resolveFindIndexFromSelection, selectFindMatchAtIndex]);

  const selectPreviousFindMatch = useCallback((): TextSelection | null => {
    if (findMatches.length === 0) {
      return null;
    }

    if (findMatchIndex >= 0) {
      return selectFindMatchAtIndex(findMatchIndex - 1);
    }

    const selection = clampSelection(editorSelection, editText.length);
    let previousIndex = -1;
    for (let index = findMatches.length - 1; index >= 0; index -= 1) {
      if (findMatches[index].end <= selection.start) {
        previousIndex = index;
        break;
      }
    }
    return selectFindMatchAtIndex(previousIndex >= 0 ? previousIndex : findMatches.length - 1);
  }, [
    editText.length,
    editorSelection,
    findMatchIndex,
    findMatches,
    selectFindMatchAtIndex,
  ]);

  const replaceCurrentMatch = useCallback(() => {
    const query = findQuery.trim();
    if (!query) {
      return;
    }

    if (findMatches.length === 0) {
      setToast({ visible: true, message: `No matches for "${query}"`, variant: 'error' });
      return;
    }

    const activeMatchIndex =
      findMatchIndex >= 0 ? findMatchIndex : resolveFindIndexFromSelection();
    if (activeMatchIndex < 0 || activeMatchIndex >= findMatches.length) {
      setToast({ visible: true, message: `No matches for "${query}"`, variant: 'error' });
      return;
    }

    const activeSelection = findMatches[activeMatchIndex];
    const nextText =
      editText.slice(0, activeSelection.start) +
      replaceQuery +
      editText.slice(activeSelection.end);
    const nextMatches = buildFindMatches(nextText, query);
    if (nextMatches.length > 0) {
      const nextIndex = Math.min(activeMatchIndex, nextMatches.length - 1);
      const nextMatch = nextMatches[nextIndex];
      updateEditorContent(nextText, nextMatch);
      setFindMatchIndex(nextIndex);
      findCursorRef.current = nextMatch.end;
    } else {
      const cursor = activeSelection.start + replaceQuery.length;
      updateEditorContent(nextText, { start: cursor, end: cursor });
      setFindMatchIndex(-1);
      findCursorRef.current = cursor;
    }
    setToast({ visible: true, message: 'Replaced current match' });
  }, [
    editText,
    findMatchIndex,
    findMatches,
    findQuery,
    replaceQuery,
    resolveFindIndexFromSelection,
    updateEditorContent,
  ]);

  const replaceAllMatches = useCallback(() => {
    const query = findQuery.trim();
    if (!query) {
      return;
    }

    if (findMatches.length === 0) {
      setToast({ visible: true, message: `No matches for "${query}"`, variant: 'error' });
      return;
    }

    const pattern = new RegExp(escapeRegExp(query), 'gi');
    const nextText = editText.replace(pattern, replaceQuery);
    const nextMatches = buildFindMatches(nextText, query);
    if (nextMatches.length > 0) {
      const nextMatch = nextMatches[0];
      updateEditorContent(nextText, nextMatch);
      setFindMatchIndex(0);
      findCursorRef.current = nextMatch.end;
    } else {
      const cursor = Math.min(nextText.length, editorSelection.start);
      updateEditorContent(nextText, { start: cursor, end: cursor });
      setFindMatchIndex(-1);
      findCursorRef.current = cursor;
    }
    setToast({
      visible: true,
      message: `Replaced ${findMatches.length} match${findMatches.length > 1 ? 'es' : ''}`,
    });
  }, [
    editText,
    editorSelection.start,
    findMatches.length,
    findQuery,
    replaceQuery,
    updateEditorContent,
  ]);

  const handleEditorSelectionChange = useCallback(
    (selection: TextSelection) => {
      setEditorSelection(selection);
      findCursorRef.current = selection.end;
      const matchedIndex = findMatches.findIndex(
        (match) => match.start === selection.start && match.end === selection.end
      );
      setFindMatchIndex(matchedIndex);
    },
    [findMatches]
  );

  const focusFindPanel = useCallback(
    (enableReplace: boolean) => {
      setShowFindPanel(true);
      if (enableReplace) {
        setShowReplacePanel(true);
      }
      if (!showFindPanel && Platform.OS === 'web') {
        setTimeout(() => {
          findInputRef.current?.focus();
        }, 0);
      }
    },
    [showFindPanel]
  );

  useEffect(() => {
    if (!showFindPanel || Platform.OS !== 'web') {
      return;
    }
    const timer = setTimeout(() => {
      findInputRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [showFindPanel]);

  useEffect(() => {
    if (!showFindPanel) {
      return;
    }

    const query = findQuery.trim();
    if (!query || findMatches.length === 0) {
      return;
    }

    if (findMatchIndex >= 0 && findMatchIndex < findMatches.length) {
      return;
    }

    const initialIndex = resolveFindIndexFromSelection();
    const targetIndex = initialIndex >= 0 ? initialIndex : 0;
    const targetMatch = findMatches[targetIndex];
    setFindMatchIndex(targetIndex);
    setEditorSelection(targetMatch);
    findCursorRef.current = targetMatch.end;
  }, [
    findMatchIndex,
    findMatches,
    findQuery,
    resolveFindIndexFromSelection,
    showFindPanel,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !isDesktopWriteLayout) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const hasModifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (hasModifier && key === 's') {
        event.preventDefault();
        setSaveIndicatorState('saving');
        performSave();
        return;
      }

      if (hasModifier && key === 'enter') {
        event.preventDefault();
        setSaveIndicatorState('saving');
        performSave();
        return;
      }

      if (hasModifier && key === 'f') {
        event.preventDefault();
        focusFindPanel(event.shiftKey);
        return;
      }

      if (showFindPanel && key === 'enter' && !hasModifier) {
        event.preventDefault();
        if (event.shiftKey) {
          selectPreviousFindMatch();
        } else {
          selectNextFindMatch();
        }
        return;
      }

      if (event.key === 'Escape') {
        if (focusMode) {
          event.preventDefault();
          setFocusMode(false);
        } else if (showFindPanel) {
          event.preventDefault();
          setShowFindPanel(false);
          setShowReplacePanel(false);
          editorRef.current?.focus();
        }
        return;
      }

      if (event.key === 'Tab' && editorFocused) {
        event.preventDefault();
        indentSelection(event.shiftKey ? 'outdent' : 'indent');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    editorFocused,
    focusFindPanel,
    focusMode,
    indentSelection,
    isDesktopWriteLayout,
    performSave,
    selectNextFindMatch,
    selectPreviousFindMatch,
    showFindPanel,
  ]);

  const persistCurrentDraftBeforeSwitch = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (!draftDirty) {
      return true;
    }
    if (!editText.trim()) {
      return true;
    }
    setSaveIndicatorState('saving');
    return performSave();
  }, [draftDirty, editText, performSave]);

  const handleSelectSongCard = useCallback((song: Song | null) => {
    const saved = persistCurrentDraftBeforeSwitch();
    if (!saved) {
      return;
    }

    setActiveSong(song);
    setActiveTab('write');
    Haptics.selectionAsync();
  }, [persistCurrentDraftBeforeSwitch, setActiveSong]);

  const tabs: { key: TabKey; label: string; icon: ComponentProps<typeof Feather>['name'] }[] = [
    { key: 'write', label: 'Write', icon: 'edit-3' },
    { key: 'structure', label: 'Structure', icon: 'layers' },
    { key: 'import', label: 'Import', icon: 'download' },
    { key: 'writer', label: 'Writer', icon: 'pen-tool' },
  ];

  const renderTitleField = () => (
    <TextInput
      value={songTitle}
      onChangeText={setSongTitle}
      placeholder="Song title"
      placeholderTextColor={Colors.textTertiary}
      style={styles.titleField}
      accessibilityLabel="Song title"
      accessibilityHint="Enter a title for your song"
    />
  );

  const renderGenreChips = (scrollable: boolean) => {
    const chips = genreList.map((genre) => {
      const isSelected = selectedGenre === genre.id;
      return (
        <Pressable
          key={genre.id}
          style={[
            styles.genreChip,
            isSelected && { backgroundColor: genre.accentColor, borderColor: genre.color },
          ]}
          onPress={() => {
            setSelectedGenre(genre.id);
            Haptics.selectionAsync();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Select ${genre.label} genre`}
          accessibilityHint="Applies coaching defaults for this style"
          accessibilityState={{ selected: isSelected }}
        >
          <Ionicons name={genre.icon} size={scaledIcon(10)} color={isSelected ? genre.color : Colors.textTertiary} />
          <Text style={[styles.genreChipText, isSelected && { color: genre.color }]}>
            {genre.label}
          </Text>
        </Pressable>
      );
    });

    if (!scrollable) {
      return <View style={styles.genreWrap}>{chips}</View>;
    }

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.genreScrollContent}
      >
        {chips}
      </ScrollView>
    );
  };

  const renderTempoControls = () => (
    <>
      <View style={styles.tempoRow}>
        <TextInput
          value={tempoBpmText}
          onChangeText={(value) => setTempoBpmText(value.replace(/[^0-9]/g, '').slice(0, 3))}
          onBlur={() => {
            if (!tempoBpmText.trim()) {
              return;
            }
            const parsed = parseInt(tempoBpmText, 10);
            if (!Number.isFinite(parsed)) {
              setTempoBpmText('');
              return;
            }
            const clamped = Math.max(30, Math.min(300, parsed));
            if (clamped !== parsed) {
              setTempoBpmText(String(clamped));
            }
          }}
          placeholder="e.g. 120"
          placeholderTextColor={Colors.textTertiary}
          style={styles.tempoField}
          keyboardType="number-pad"
          accessibilityLabel="Tempo in beats per minute"
          accessibilityHint="Sets the song tempo used for count-in while recording"
        />
        <Pressable
          onPress={handleTapTempo}
          style={styles.tapTempoButton}
          accessibilityRole="button"
          accessibilityLabel="Tap tempo"
          accessibilityHint="Tap repeatedly to detect BPM"
        >
          <Feather name="activity" size={scaledIcon(12)} color={Colors.textSecondary} />
          <Text style={styles.tapTempoText}>Tap</Text>
        </Pressable>
      </View>
      <Text style={styles.tempoHint}>
        Used for count-in tempo (and upcoming timing coaching).
      </Text>
    </>
  );

  const renderInsertButtons = () => (
    <View style={styles.insertRow}>
      {INSERT_SECTION_OPTIONS.map((option) => (
        <Pressable
          key={option.type}
          style={styles.insertBtn}
          onPress={() => handleInsertSection(option)}
          accessibilityRole="button"
          accessibilityLabel={`Insert ${option.label} section`}
          accessibilityHint="Adds a section header in the lyrics editor"
        >
          <Ionicons name="add" size={scaledIcon(10)} color={Colors.textSecondary} />
          <Text style={styles.insertBtnText}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );

  const renderDesktopLibraryPane = () => (
    <View style={[styles.desktopPaneCard, { minHeight: desktopPaneMinHeight }]}>
      <View style={styles.desktopPaneHeader}>
        <Text style={styles.desktopPaneTitle}>Song Cards</Text>
        <Text style={styles.desktopPaneHint}>{sortedSongs.length} saved</Text>
      </View>
      <ScrollView
        style={styles.desktopLibraryScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.desktopLibraryScrollContent}
      >
        <Pressable
          onPress={() => handleSelectSongCard(null)}
          style={[
            styles.desktopLibraryCard,
            styles.desktopLibraryCardDraft,
            !activeSong && styles.desktopLibraryCardActive,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Start a new lyrics draft"
          accessibilityHint="Clears the editor so you can write a new song"
          accessibilityState={{ selected: !activeSong }}
        >
          <View style={styles.desktopLibraryNewIcon}>
            <Ionicons name="add" size={scaledIcon(10)} color={Colors.gradientStart} />
          </View>
          <View style={styles.desktopLibraryCardBody}>
            <Text style={styles.desktopLibraryTitle}>New Draft</Text>
            <Text style={styles.desktopLibraryMeta}>Create another lyrics card</Text>
          </View>
        </Pressable>

        {sortedSongs.map((song) => {
          const isActiveCard = activeSong?.id === song.id;
          const profile = getGenreProfile(song.genre);
          const lineCount = song.lyrics.split('\n').filter((line) => line.trim()).length;
          const bpm =
            typeof song.bpm === 'number' && Number.isFinite(song.bpm)
              ? Math.max(30, Math.min(300, Math.round(song.bpm)))
              : null;

          return (
            <Pressable
              key={`desktop-${song.id}`}
              onPress={() => handleSelectSongCard(song)}
              style={[styles.desktopLibraryCard, isActiveCard && styles.desktopLibraryCardActive]}
              accessibilityRole="button"
              accessibilityLabel={`Open lyrics card for ${song.title}`}
              accessibilityHint="Loads this song in the lyrics editor"
              accessibilityState={{ selected: isActiveCard }}
            >
              <View style={styles.desktopLibraryCardTop}>
                <View style={[styles.libraryGenreBadge, { backgroundColor: profile.accentColor, borderColor: profile.color }]}>
                  <Ionicons name={profile.icon} size={scaledIcon(8)} color={profile.color} />
                  <Text style={[styles.libraryGenreText, { color: profile.color }]}>{profile.label}</Text>
                </View>
                {isActiveCard ? (
                  <Ionicons name="checkmark-circle" size={scaledIcon(10)} color={Colors.gradientStart} />
                ) : null}
              </View>
              <View style={styles.desktopLibraryCardBody}>
                <Text style={[styles.desktopLibraryTitle, isActiveCard && styles.desktopLibraryTitleActive]} numberOfLines={1}>
                  {song.title}
                </Text>
                <Text style={styles.desktopLibraryPreview} numberOfLines={2}>
                  {firstLyricLine(song.lyrics)}
                </Text>
                <Text style={styles.desktopLibraryMeta} numberOfLines={1}>
                  {lineCount} lines
                  {bpm ? ` • ${bpm} BPM` : ''}
                  {` • ${formatShortDate(song.updatedAt)}`}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderDesktopFindPanel = () => {
    if (!showFindPanel) {
      return null;
    }

    const query = findQuery.trim();
    const canSearch = query.length > 0;
    const hasMatches = findMatches.length > 0;
    const activeMatchLabel =
      hasMatches && findMatchIndex >= 0
        ? `${findMatchIndex + 1}/${findMatches.length}`
        : `0/${findMatches.length}`;

    return (
      <View style={styles.findPanel}>
        <View style={styles.findHeaderRow}>
          <Text style={styles.findHeaderLabel}>Search Lyrics</Text>
          <Text style={styles.findCountText}>
            {hasMatches ? activeMatchLabel : canSearch ? 'No matches' : 'Type to search'}
          </Text>
        </View>
        <TextInput
          ref={findInputRef}
          value={findQuery}
          onChangeText={(value) => {
            setFindQuery(value);
            findCursorRef.current = 0;
          }}
          onSubmitEditing={() => {
            if (!selectNextFindMatch() && query) {
              setToast({ visible: true, message: `No matches for "${query}"`, variant: 'error' });
            }
          }}
          placeholder="Find..."
          placeholderTextColor={Colors.textTertiary}
          style={styles.findInput}
          accessibilityLabel="Find in lyrics"
        />
        {showReplacePanel && (
          <TextInput
            value={replaceQuery}
            onChangeText={setReplaceQuery}
            placeholder="Replace with..."
            placeholderTextColor={Colors.textTertiary}
            style={styles.findInput}
            accessibilityLabel="Replace text in lyrics"
          />
        )}
        <View style={styles.findActions}>
          <Pressable
            style={[styles.findBtn, !canSearch && styles.findBtnDisabled]}
            disabled={!canSearch}
            onPress={() => {
              if (!selectPreviousFindMatch() && query) {
                setToast({ visible: true, message: `No matches for "${query}"`, variant: 'error' });
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Find previous match"
          >
            <Text style={styles.findBtnText}>Prev</Text>
          </Pressable>
          <Pressable
            style={[styles.findBtn, !canSearch && styles.findBtnDisabled]}
            disabled={!canSearch}
            onPress={() => {
              if (!selectNextFindMatch() && query) {
                setToast({ visible: true, message: `No matches for "${query}"`, variant: 'error' });
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Find next match"
          >
            <Text style={styles.findBtnText}>Next</Text>
          </Pressable>
          <Pressable
            style={styles.findBtn}
            onPress={() => {
              setShowReplacePanel((value) => !value);
            }}
            accessibilityRole="button"
            accessibilityLabel="Toggle replace controls"
          >
            <Text style={styles.findBtnText}>Replace</Text>
          </Pressable>
          {showReplacePanel ? (
            <>
              <Pressable
                style={[styles.findBtn, !(canSearch && hasMatches) && styles.findBtnDisabled]}
                disabled={!(canSearch && hasMatches)}
                onPress={replaceCurrentMatch}
                accessibilityRole="button"
                accessibilityLabel="Replace current match"
              >
                <Text style={styles.findBtnText}>Replace One</Text>
              </Pressable>
              <Pressable
                style={[styles.findBtn, !(canSearch && hasMatches) && styles.findBtnDisabled]}
                disabled={!(canSearch && hasMatches)}
                onPress={replaceAllMatches}
                accessibilityRole="button"
                accessibilityLabel="Replace all matches"
              >
                <Text style={styles.findBtnText}>Replace All</Text>
              </Pressable>
            </>
          ) : null}
          <Pressable
            style={styles.findBtn}
            onPress={() => {
              setShowFindPanel(false);
              setShowReplacePanel(false);
              setFindMatchIndex(-1);
              editorRef.current?.focus();
            }}
            accessibilityRole="button"
            accessibilityLabel="Close find panel"
          >
            <Text style={styles.findBtnText}>Close</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <LogoHeader />
      <View style={[styles.header, sectionWrapStyle, { paddingHorizontal: horizontalInset }]}>
        <View style={styles.headerMain}>
          <Text style={styles.headerTitle} accessibilityRole="header">Lyrics</Text>
          <View style={styles.headerMetaRow} accessibilityLiveRegion="polite">
            <View
              style={[styles.saveBadge, saveIndicatorBadgeStyle]}
              testID="lyrics-save-indicator"
            >
              <View style={[styles.saveBadgeDot, { backgroundColor: saveIndicatorDotColor }]} />
              <Text style={styles.saveBadgeText}>{saveIndicatorLabel}</Text>
            </View>
            <Text style={styles.headerMetaText} testID="lyrics-last-saved">
              {lastSavedLabel}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => handleSelectSongCard(null)}
          hitSlop={12}
          style={styles.newSongButton}
          accessibilityRole="button"
          accessibilityLabel="Create new song draft"
          accessibilityHint="Switches to a new empty lyrics card"
        >
          <Ionicons name="add-circle-outline" size={scaledIcon(18)} color={Colors.gradientStart} />
        </Pressable>
      </View>

      {toast.visible && (
        <Toast
          visible={toast.visible}
          message={toast.message}
          variant={toast.variant ?? 'success'}
          onHide={() => setToast(t => ({ ...t, visible: false }))}
        />
      )}

      {isMobileLyricsLayout && (
        <View style={[styles.mobileFocusBar, sectionWrapStyle, { paddingHorizontal: horizontalInset }]}>
          <View style={styles.mobileFocusLabelGroup}>
            <Text style={styles.mobileFocusLabel}>Lyrics Focus</Text>
            <Text style={styles.mobileFocusHint}>
              {mobileLyricsFocus ? 'Content-first layout' : 'Tools + library visible'}
            </Text>
          </View>
          <Pressable
            style={[styles.mobileFocusToggle, mobileLyricsFocus && styles.mobileFocusToggleActive]}
            onPress={() => {
              setMobileLyricsFocus((value) => !value);
              Haptics.selectionAsync();
            }}
            accessibilityRole="switch"
            accessibilityLabel="Toggle mobile lyrics focus mode"
            accessibilityHint="Hides extra panels so the active lyrics tab stays front and center"
            accessibilityState={{ checked: mobileLyricsFocus }}
          >
            <Text
              style={[
                styles.mobileFocusToggleText,
                mobileLyricsFocus && styles.mobileFocusToggleTextActive,
              ]}
            >
              {mobileLyricsFocus ? 'Focused' : 'Expanded'}
            </Text>
          </Pressable>
        </View>
      )}

      {showTopLibrary && (
        <View style={[styles.librarySection, sectionWrapStyle, { paddingHorizontal: horizontalInset }]}>
          <View style={styles.libraryHeader}>
            <Text style={styles.libraryTitle}>Lyrics Library</Text>
            <Text style={styles.libraryHint}>Tap a card to switch songs</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.libraryScrollContent}
          >
            <Pressable
              onPress={() => handleSelectSongCard(null)}
              style={[
                styles.libraryCard,
                styles.newDraftCard,
                !activeSong && styles.libraryCardActive,
                { width: libraryCardWidth },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Start a new lyrics draft"
              accessibilityHint="Clears the editor so you can write a new song"
              accessibilityState={{ selected: !activeSong }}
            >
              <View style={styles.newDraftIcon}>
                <Ionicons name="add" size={scaledIcon(12)} color={Colors.gradientStart} />
              </View>
              <Text style={styles.newDraftTitle}>New Draft</Text>
              <Text style={styles.newDraftMeta}>Create another lyric card</Text>
            </Pressable>

            {sortedSongs.map((song) => {
              const isActiveCard = activeSong?.id === song.id;
              const profile = getGenreProfile(song.genre);
              const lineCount = song.lyrics.split('\n').filter((line) => line.trim()).length;
              const bpm =
                typeof song.bpm === 'number' && Number.isFinite(song.bpm)
                  ? Math.max(30, Math.min(300, Math.round(song.bpm)))
                  : null;

              return (
                <Pressable
                  key={song.id}
                  onPress={() => handleSelectSongCard(song)}
                  style={[
                    styles.libraryCard,
                    isActiveCard && styles.libraryCardActive,
                    { width: libraryCardWidth },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Open lyrics card for ${song.title}`}
                  accessibilityHint="Loads this song in the lyrics editor"
                  accessibilityState={{ selected: isActiveCard }}
                >
                  <View style={styles.libraryCardTop}>
                    <View style={[styles.libraryGenreBadge, { backgroundColor: profile.accentColor, borderColor: profile.color }]}>
                      <Ionicons name={profile.icon} size={scaledIcon(8)} color={profile.color} />
                      <Text style={[styles.libraryGenreText, { color: profile.color }]}>{profile.label}</Text>
                    </View>
                    {isActiveCard ? (
                      <Ionicons name="checkmark-circle" size={scaledIcon(10)} color={Colors.gradientStart} />
                    ) : null}
                  </View>
                  <Text style={[styles.librarySongTitle, isActiveCard && styles.librarySongTitleActive]} numberOfLines={1}>
                    {song.title}
                  </Text>
                  <Text style={styles.librarySongPreview} numberOfLines={2}>
                    {firstLyricLine(song.lyrics)}
                  </Text>
                  <Text style={styles.librarySongMeta} numberOfLines={1}>
                    {lineCount} lines
                    {bpm ? ` • ${bpm} BPM` : ''}
                    {` • ${formatShortDate(song.updatedAt)}`}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {showTopComposerControls && (
        <>
          <View style={[styles.titleInput, sectionWrapStyle, { paddingHorizontal: horizontalInset }]}>
            {renderTitleField()}
          </View>

          <View style={[styles.genreSection, sectionWrapStyle, { paddingHorizontal: horizontalInset }]}>
            <Text style={styles.genreSectionLabel}>Genre</Text>
            {renderGenreChips(true)}
          </View>

          <View style={[styles.tempoSection, sectionWrapStyle, { paddingHorizontal: horizontalInset }]}>
            <View style={styles.sectionLabelRow}>
              <Image
                source={bpmIconSource}
                style={[
                  styles.sectionLabelIcon,
                  {
                    width: bpmIconSize,
                    height: bpmIconSize,
                    borderRadius: Math.round(bpmIconSize * 0.3),
                  },
                ]}
                resizeMode="cover"
                accessible={false}
              />
              <Text style={styles.genreSectionLabel}>Tempo (BPM)</Text>
            </View>
            {renderTempoControls()}
          </View>
        </>
      )}

      {activeSong && !mobileLyricsFocus && (
        <View style={[styles.syncInfoBar, sectionWrapStyle, { paddingHorizontal: horizontalInset }]}>
          <View style={styles.syncInfoTopRow}>
            <View style={styles.syncInfoLabelRow}>
              <Ionicons name="sync-outline" size={scaledIcon(10)} color={Colors.gradientStart} />
              <Text style={styles.syncInfoLabel}>Lyrics Sync</Text>
            </View>
            <Pressable
              style={styles.syncInfoButton}
              onPress={() => router.push('/(tabs)/profile')}
              accessibilityRole="button"
              accessibilityLabel="Open lyrics sync controls"
              accessibilityHint="Opens profile sync settings"
            >
              <Text style={styles.syncInfoButtonText}>Open Sync Controls</Text>
            </Pressable>
          </View>
          <Text style={styles.syncInfoText} numberOfLines={2} testID="lyrics-sync-filters">
            Filters: {lyricsSyncFilterLabel} • {lastSyncedLabel}
          </Text>
        </View>
      )}

      {!(isDesktopWriteLayout && focusMode) && (
        <View style={[styles.tabBar, sectionWrapStyle, { paddingHorizontal: horizontalInset }]}>
          {tabs.map(tab => (
            <Pressable
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => {
                setActiveTab(tab.key);
                Haptics.selectionAsync();
              }}
              accessibilityRole="tab"
              accessibilityLabel={`${tab.label} tab`}
              accessibilityState={{ selected: activeTab === tab.key }}
            >
              <Feather
                name={tab.icon}
                size={scaledIcon(12)}
                color={activeTab === tab.key ? Colors.gradientStart : Colors.textTertiary}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab.key && styles.tabTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <ScrollView
        style={[styles.content, sectionWrapStyle, { paddingHorizontal: horizontalInset }]}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, webBottomInset) + 24 }}
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        scrollEnabled
      >
        {activeTab === 'write' && (
          <View style={styles.writeTab}>
            {isDesktopWriteLayout ? (
              <View style={[styles.writeDesktopLayout, { gap: desktopPaneGap }]}>
                {showDesktopThreePane && (
                  <View style={[styles.writeDesktopLibrary, { width: desktopLibraryPaneWidth }]}>
                    {renderDesktopLibraryPane()}
                  </View>
                )}
                <View
                  style={[
                    styles.writeDesktopMain,
                    focusMode && styles.writeDesktopMainFocus,
                    focusMode && { maxWidth: desktopFocusMaxWidth },
                  ]}
                >
                  <View style={styles.editorToolbar}>
                    <View style={styles.editorToolbarLeft}>
                      <Text style={styles.editorToolbarTitle}>Lyrics Editor</Text>
                      <Text style={styles.editorToolbarHint}>Cmd/Ctrl+S save • Cmd/Ctrl+F find • Tab indent</Text>
                      <Text style={styles.editorToolbarStatus}>{saveIndicatorLabel} • {lastSavedLabel}</Text>
                    </View>
                    <View style={styles.editorToolbarActions}>
                      <Pressable
                        style={styles.editorToolbarButton}
                        onPress={() => {
                          focusFindPanel(false);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Open find"
                        accessibilityHint="Find and replace text in lyrics"
                      >
                        <Feather name="search" size={scaledIcon(10)} color={Colors.textSecondary} />
                        <Text style={styles.editorToolbarButtonText}>Find</Text>
                      </Pressable>
                      <Pressable
                        style={styles.editorToolbarButton}
                        onPress={() => {
                          setFocusMode((value) => !value);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={focusMode ? 'Exit focus mode' : 'Enter focus mode'}
                        accessibilityHint="Toggles distraction-free writing layout"
                      >
                        <Feather name={focusMode ? 'minimize-2' : 'maximize-2'} size={scaledIcon(10)} color={Colors.textSecondary} />
                        <Text style={styles.editorToolbarButtonText}>{focusMode ? 'Exit Focus' : 'Focus Mode'}</Text>
                      </Pressable>
                    </View>
                  </View>

                  {renderDesktopFindPanel()}

                  <TextInput
                    ref={editorRef}
                    value={editText}
                    onChangeText={setEditText}
                    onFocus={() => setEditorFocused(true)}
                    onBlur={() => setEditorFocused(false)}
                    onSelectionChange={(event) => {
                      const selection = event.nativeEvent.selection;
                      if (!selection) {
                        return;
                      }
                      handleEditorSelectionChange({ start: selection.start, end: selection.end });
                    }}
                    selection={editorSelection}
                    placeholder="Write your lyrics here..."
                    placeholderTextColor={Colors.textTertiary}
                    style={[
                      styles.lyricsEditor,
                      styles.lyricsEditorDesktop,
                      { minHeight: desktopEditorMinHeight },
                    ]}
                    multiline
                    textAlignVertical="top"
                    accessibilityLabel="Lyrics editor"
                    accessibilityHint="Write song lyrics and section headers"
                  />
                </View>
                {showDesktopThreePane && (
                  <View
                    style={[
                      styles.writeDesktopSide,
                      {
                        width: desktopSidePaneWidth,
                        gap: Math.max(10, desktopPaneGap - 6),
                      },
                    ]}
                  >
                    <View style={styles.desktopComposerCard}>
                      <Text style={styles.desktopComposerTitle}>Song</Text>
                      {renderTitleField()}
                    </View>
                    <View style={styles.desktopComposerCard}>
                      <Text style={styles.desktopComposerTitle}>Genre</Text>
                      {renderGenreChips(false)}
                    </View>
                    <View style={styles.desktopComposerCard}>
                      <View style={styles.sectionLabelRow}>
                        <Image
                          source={bpmIconSource}
                          style={[
                            styles.sectionLabelIcon,
                            {
                              width: bpmIconSize,
                              height: bpmIconSize,
                              borderRadius: Math.round(bpmIconSize * 0.3),
                            },
                          ]}
                          resizeMode="cover"
                          accessible={false}
                        />
                        <Text style={styles.desktopComposerTitle}>Tempo</Text>
                      </View>
                      {renderTempoControls()}
                    </View>
                    <View style={styles.desktopComposerCard}>
                      <Text style={styles.desktopComposerTitle}>Insert Sections</Text>
                      {renderInsertButtons()}
                    </View>
                    <View style={styles.desktopComposerCard}>
                      <Text style={styles.desktopComposerTitle}>Section Navigator</Text>
                      {sectionAnchors.length > 0 ? (
                        <ScrollView
                          style={[styles.sectionNavigatorList, { maxHeight: sectionNavigatorMaxHeight }]}
                          showsVerticalScrollIndicator={false}
                          contentContainerStyle={styles.sectionNavigatorListContent}
                        >
                          {sectionAnchors.map((anchor) => (
                            <Pressable
                              key={anchor.id}
                              style={styles.sectionNavigatorItem}
                              onPress={() => jumpToSectionAnchor(anchor)}
                              accessibilityRole="button"
                              accessibilityLabel={`Jump to ${anchor.label}`}
                              accessibilityHint="Moves cursor to this section in the lyrics editor"
                            >
                              <Ionicons
                                name="return-up-forward-outline"
                                size={scaledIcon(10)}
                                color={Colors.textSecondary}
                              />
                              <Text style={styles.sectionNavigatorItemText}>{anchor.label}</Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      ) : (
                        <Text style={styles.desktopHintText}>Add section headers like [Verse] or [Chorus] to navigate quickly.</Text>
                      )}
                    </View>
                    <View style={styles.desktopComposerCard}>
                      <Text style={styles.desktopComposerTitle}>Section Goals</Text>
                      {sectionGoalHints.slice(0, 5).map((goal, idx) => (
                        <View key={`${goal.sectionLabel}-${idx}`} style={styles.sectionGoalItem}>
                          <Text style={styles.sectionGoalLabel}>{goal.sectionLabel}</Text>
                          <Text style={styles.sectionGoalText}>{goal.goal}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={styles.desktopComposerCard}>
                      <Text style={styles.desktopComposerTitle}>Shortcuts</Text>
                      <Text style={styles.desktopHintText}>Cmd/Ctrl+S: Save</Text>
                      <Text style={styles.desktopHintText}>Cmd/Ctrl+F: Find</Text>
                      <Text style={styles.desktopHintText}>Cmd/Ctrl+Shift+F: Replace</Text>
                      <Text style={styles.desktopHintText}>Tab / Shift+Tab: Indent</Text>
                      <Text style={styles.desktopHintText}>Esc: Exit focus/find</Text>
                    </View>
                  </View>
                )}
              </View>
            ) : (
              <>
                {isNativeIpad && (
                  <View style={styles.ipadPaperRow}>
                    <View style={styles.ipadPaperBadge}>
                      <Ionicons name="create-outline" size={scaledIcon(10)} color={Colors.gradientStart} />
                      <Text style={styles.ipadPaperBadgeText}>Apple Pencil</Text>
                    </View>
                    <Pressable
                      style={[styles.ipadPaperToggle, paperModeEnabled && styles.ipadPaperToggleActive]}
                      onPress={() => {
                        setPaperModeEnabled((value) => !value);
                        Haptics.selectionAsync();
                      }}
                      accessibilityRole="switch"
                      accessibilityLabel="Toggle paper writing mode"
                      accessibilityHint="Enables lined paper style for Apple Pencil writing"
                      accessibilityState={{ checked: paperModeEnabled }}
                    >
                      <Text
                        style={[
                          styles.ipadPaperToggleText,
                          paperModeEnabled && styles.ipadPaperToggleTextActive,
                        ]}
                      >
                        {paperModeEnabled ? 'Paper Mode On' : 'Paper Mode Off'}
                      </Text>
                    </Pressable>
                  </View>
                )}
                <View style={[styles.paperEditorShell, paperModeEnabled && styles.paperEditorShellActive]}>
                  {paperModeEnabled && (
                    <View pointerEvents="none" style={styles.paperLinesOverlay}>
                      {PAPER_GUIDE_LINES.map((lineIndex) => (
                        <View
                          key={`paper-line-${lineIndex}`}
                          style={[
                            styles.paperGuideLine,
                            { top: 18 + lineIndex * PAPER_LINE_HEIGHT },
                          ]}
                        />
                      ))}
                    </View>
                  )}
                  <TextInput
                    ref={editorRef}
                    value={editText}
                    onChangeText={setEditText}
                    onFocus={() => setEditorFocused(true)}
                    onBlur={() => setEditorFocused(false)}
                    onSelectionChange={(event) => {
                      const selection = event.nativeEvent.selection;
                      if (!selection) {
                        return;
                      }
                      handleEditorSelectionChange({ start: selection.start, end: selection.end });
                    }}
                    placeholder="Write your lyrics here..."
                    placeholderTextColor={Colors.textTertiary}
                    style={[
                      styles.lyricsEditor,
                      isNativeIpad && styles.lyricsEditorIpad,
                      paperModeEnabled && styles.lyricsEditorPaper,
                      mobileLyricsFocus && styles.lyricsEditorMobileFocus,
                    ]}
                    multiline
                    textAlignVertical="top"
                    accessibilityLabel="Lyrics editor"
                    accessibilityHint={
                      paperModeEnabled
                        ? 'Lined paper mode for Apple Pencil writing'
                        : 'Write song lyrics and section headers'
                    }
                  />
                  {isNativeIpad && paperModeEnabled && (
                    <PencilInkLayer visible sessionKey={pencilSessionKey} />
                  )}
                </View>
                {isNativeIpad && paperModeEnabled && (
                  <Text style={styles.paperHintText}>
                    Tip: use Apple Pencil Scribble, then open Ink On for pen/highlighter, eraser, undo/redo and stylus-priority.
                  </Text>
                )}
                {!mobileLyricsFocus && (
                  <>
                    {renderInsertButtons()}
                    <View style={styles.mobileSectionGoalCard}>
                      <Text style={styles.genreSectionLabel}>Section Goals</Text>
                      {sectionGoalHints.slice(0, 4).map((goal, idx) => (
                        <View key={`${goal.sectionLabel}-mobile-${idx}`} style={styles.sectionGoalItem}>
                          <Text style={styles.sectionGoalLabel}>{goal.sectionLabel}</Text>
                          <Text style={styles.sectionGoalText}>{goal.goal}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}
          </View>
        )}

        {activeTab === 'structure' && (
          <View style={styles.structureTab}>
            {isDesktopStructureLayout ? (
              <View style={[styles.writeDesktopLayout, { gap: desktopPaneGap }]}>
                {showDesktopThreePane && (
                  <View style={[styles.writeDesktopLibrary, { width: desktopLibraryPaneWidth }]}>
                    {renderDesktopLibraryPane()}
                  </View>
                )}
                <View style={styles.writeDesktopMain}>
                  <View style={styles.editorToolbar}>
                    <View style={styles.editorToolbarLeft}>
                      <Text style={styles.editorToolbarTitle}>Structure</Text>
                      <Text style={styles.editorToolbarHint}>Organize and reorder sections for your arrangement</Text>
                    </View>
                  </View>
                  <View style={[styles.desktopMainCard, { minHeight: desktopEditorMinHeight }]}>
                    {activeSong?.sections && activeSong.sections.length > 0 ? (
                      <ScrollView
                        style={styles.desktopMainScroll}
                        contentContainerStyle={styles.desktopMainScrollContent}
                        showsVerticalScrollIndicator={false}
                      >
                        {activeSong.sections.map((section, idx) => (
                          <SectionCard
                            key={section.id}
                            section={section}
                            index={idx}
                            onMoveUp={() => moveSectionUp(idx)}
                            onMoveDown={() => moveSectionDown(idx)}
                            isFirst={idx === 0}
                            isLast={idx === activeSong.sections.length - 1}
                          />
                        ))}
                      </ScrollView>
                    ) : (
                      <View style={styles.emptyStruct}>
                        <Feather name="layers" size={scaledIcon(28)} color={Colors.textTertiary} />
                        <Text style={styles.emptyStructText}>
                          Write lyrics first to see structure
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                {showDesktopThreePane && (
                  <View
                    style={[
                      styles.writeDesktopSide,
                      {
                        width: desktopSidePaneWidth,
                        gap: Math.max(10, desktopPaneGap - 6),
                      },
                    ]}
                  >
                    <View style={styles.desktopComposerCard}>
                      <Text style={styles.desktopComposerTitle}>Song</Text>
                      {renderTitleField()}
                    </View>
                    <View style={styles.desktopComposerCard}>
                      <Text style={styles.desktopComposerTitle}>Genre</Text>
                      {renderGenreChips(false)}
                    </View>
                    <View style={styles.desktopComposerCard}>
                      <View style={styles.sectionLabelRow}>
                        <Image
                          source={bpmIconSource}
                          style={[
                            styles.sectionLabelIcon,
                            {
                              width: bpmIconSize,
                              height: bpmIconSize,
                              borderRadius: Math.round(bpmIconSize * 0.3),
                            },
                          ]}
                          resizeMode="cover"
                          accessible={false}
                        />
                        <Text style={styles.desktopComposerTitle}>Tempo</Text>
                      </View>
                      {renderTempoControls()}
                    </View>
                    <View style={styles.desktopComposerCard}>
                      <Text style={styles.desktopComposerTitle}>Insert Sections</Text>
                      {renderInsertButtons()}
                    </View>
                    <View style={styles.desktopComposerCard}>
                      <Text style={styles.desktopComposerTitle}>Section Navigator</Text>
                      {sectionAnchors.length > 0 ? (
                        <ScrollView
                          style={[styles.sectionNavigatorList, { maxHeight: sectionNavigatorMaxHeight }]}
                          showsVerticalScrollIndicator={false}
                          contentContainerStyle={styles.sectionNavigatorListContent}
                        >
                          {sectionAnchors.map((anchor) => (
                            <Pressable
                              key={`structure-${anchor.id}`}
                              style={styles.sectionNavigatorItem}
                              onPress={() => jumpToSectionAnchor(anchor)}
                              accessibilityRole="button"
                              accessibilityLabel={`Jump to ${anchor.label}`}
                              accessibilityHint="Moves cursor to this section in the lyrics editor"
                            >
                              <Ionicons
                                name="return-up-forward-outline"
                                size={scaledIcon(10)}
                                color={Colors.textSecondary}
                              />
                              <Text style={styles.sectionNavigatorItemText}>{anchor.label}</Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      ) : (
                        <Text style={styles.desktopHintText}>Add section headers like [Verse] or [Chorus] to navigate quickly.</Text>
                      )}
                    </View>
                  </View>
                )}
              </View>
            ) : (
              <>
                {activeSong?.sections && activeSong.sections.length > 0 ? (
                  activeSong.sections.map((section, idx) => (
                    <SectionCard
                      key={section.id}
                      section={section}
                      index={idx}
                      onMoveUp={() => moveSectionUp(idx)}
                      onMoveDown={() => moveSectionDown(idx)}
                      isFirst={idx === 0}
                      isLast={idx === activeSong.sections.length - 1}
                    />
                  ))
                ) : (
                  <View style={styles.emptyStruct}>
                    <Feather name="layers" size={scaledIcon(28)} color={Colors.textTertiary} />
                    <Text style={styles.emptyStructText}>
                      Write lyrics first to see structure
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {activeTab === 'import' && (
          <View style={styles.importTab}>
            {isDesktopImportLayout ? (
              <View style={[styles.writeDesktopLayout, { gap: desktopPaneGap }]}>
                {showDesktopThreePane && (
                  <View style={[styles.writeDesktopLibrary, { width: desktopLibraryPaneWidth }]}>
                    {renderDesktopLibraryPane()}
                  </View>
                )}
                <View style={styles.writeDesktopMain}>
                  <View style={styles.editorToolbar}>
                    <View style={styles.editorToolbarLeft}>
                      <Text style={styles.editorToolbarTitle}>Import</Text>
                      <Text style={styles.editorToolbarHint}>Paste or draft lyrics, then push to Write</Text>
                    </View>
                  </View>
                  <View style={[styles.desktopMainCard, { minHeight: desktopEditorMinHeight }]}>
                    <TextInput
                      value={importText}
                      onChangeText={setImportText}
                      placeholder="Paste lyrics here..."
                      placeholderTextColor={Colors.textTertiary}
                      style={[styles.importEditor, styles.importEditorDesktop]}
                      multiline
                      textAlignVertical="top"
                      accessibilityLabel="Import lyrics"
                      accessibilityHint="Paste lyrics text to use in your song"
                    />
                    <Pressable
                      style={[styles.importBtn, !importText.trim() && styles.importBtnDisabled]}
                      onPress={handleImport}
                      disabled={!importText.trim()}
                      accessibilityRole="button"
                      accessibilityLabel="Use pasted lyrics"
                      accessibilityHint="Copies pasted text into the lyrics editor"
                      accessibilityState={{ disabled: !importText.trim() }}
                    >
                      <Text style={styles.importBtnText}>Use Pasted Lyrics</Text>
                    </Pressable>
                  </View>
                </View>
                {showDesktopThreePane && (
                  <View
                    style={[
                      styles.writeDesktopSide,
                      {
                        width: desktopSidePaneWidth,
                        gap: Math.max(10, desktopPaneGap - 6),
                      },
                    ]}
                  >
                    <View style={styles.desktopComposerCard}>
                      <Text style={styles.desktopComposerTitle}>Song</Text>
                      {renderTitleField()}
                    </View>
                    <View style={styles.desktopComposerCard}>
                      <Text style={styles.desktopComposerTitle}>Genre</Text>
                      {renderGenreChips(false)}
                    </View>
                    <View style={styles.desktopComposerCard}>
                      <View style={styles.sectionLabelRow}>
                        <Image
                          source={bpmIconSource}
                          style={[
                            styles.sectionLabelIcon,
                            {
                              width: bpmIconSize,
                              height: bpmIconSize,
                              borderRadius: Math.round(bpmIconSize * 0.3),
                            },
                          ]}
                          resizeMode="cover"
                          accessible={false}
                        />
                        <Text style={styles.desktopComposerTitle}>Tempo</Text>
                      </View>
                      {renderTempoControls()}
                    </View>
                    <View style={styles.desktopComposerCard}>
                      <Text style={styles.desktopComposerTitle}>Import Tips</Text>
                      <Text style={styles.desktopHintText}>Use section headers like [Verse], [Pre-Chorus], [Chorus].</Text>
                      <Text style={styles.desktopHintText}>Preserve blank lines between sections for clearer structure.</Text>
                      <Text style={styles.desktopHintText}>After import, switch to Write to fine tune wording and flow.</Text>
                    </View>
                  </View>
                )}
              </View>
            ) : (
              <>
                <TextInput
                  value={importText}
                  onChangeText={setImportText}
                  placeholder="Paste lyrics here..."
                  placeholderTextColor={Colors.textTertiary}
                  style={styles.importEditor}
                  multiline
                  textAlignVertical="top"
                  accessibilityLabel="Import lyrics"
                  accessibilityHint="Paste lyrics text to use in your song"
                />
                <Pressable
                  style={[styles.importBtn, !importText.trim() && styles.importBtnDisabled]}
                  onPress={handleImport}
                  disabled={!importText.trim()}
                  accessibilityRole="button"
                  accessibilityLabel="Use pasted lyrics"
                  accessibilityHint="Copies pasted text into the lyrics editor"
                  accessibilityState={{ disabled: !importText.trim() }}
                >
                  <Text style={styles.importBtnText}>Use Pasted Lyrics</Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {activeTab === 'writer' && (
          <View style={styles.writerTab}>
            {isDesktopWriterLayout ? (
              <View style={[styles.writeDesktopLayout, { gap: desktopPaneGap }]}>
                {showDesktopThreePane && (
                  <View style={[styles.writeDesktopLibrary, { width: desktopLibraryPaneWidth }]}>
                    {renderDesktopLibraryPane()}
                  </View>
                )}
                <View style={styles.writeDesktopMain}>
                  <View style={styles.editorToolbar}>
                    <View style={styles.editorToolbarLeft}>
                      <Text style={styles.editorToolbarTitle}>Writer Studio</Text>
                      <Text style={styles.editorToolbarHint}>
                        Meter, rhymes, hook lab, comments, timeline, sing-back links, and pro export
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.desktopMainCard, { minHeight: desktopEditorMinHeight }]}>
                    <ScrollView
                      style={styles.desktopMainScroll}
                      contentContainerStyle={styles.desktopMainScrollContent}
                      showsVerticalScrollIndicator={false}
                    >
                      <LyricsWriterStudio
                        lyrics={editText}
                        songTitle={songTitle || activeSong?.title || 'Untitled'}
                        genreLabel={getGenreProfile(selectedGenre).label}
                        bpm={tempoBpmText.trim() ? Number.parseInt(tempoBpmText, 10) : activeSong?.bpm}
                        sessions={sessions}
                        activeSongId={activeSong?.id}
                        versions={lyricsVersions}
                        comments={lineComments}
                        captures={captureInbox}
                        onCreateVersion={(note) => {
                          void handleCreateVersionSnapshot(note);
                        }}
                        onRestoreVersion={handleRestoreVersion}
                        onDeleteVersion={(versionId) => {
                          void handleDeleteVersion(versionId);
                        }}
                        onUpsertComment={(lineNumber, text) => {
                          void handleUpsertLineComment(lineNumber, text);
                        }}
                        onDeleteComment={(commentId) => {
                          void handleDeleteLineComment(commentId);
                        }}
                        onAddCapture={(text) => {
                          void handleAddCapture(text);
                        }}
                        onToggleCapturePin={(captureId) => {
                          void handleToggleCapturePin(captureId);
                        }}
                        onDeleteCapture={(captureId) => {
                          void handleDeleteCapture(captureId);
                        }}
                        onInsertText={insertTextAtCursor}
                        onJumpToLine={jumpToLineFromWriter}
                        onExport={(mode) => {
                          void handleWriterExport(mode);
                        }}
                      />
                    </ScrollView>
                  </View>
                </View>
                {showDesktopThreePane && (
                  <View
                    style={[
                      styles.writeDesktopSide,
                      {
                        width: desktopSidePaneWidth,
                        gap: Math.max(10, desktopPaneGap - 6),
                      },
                    ]}
                  >
                    <View style={styles.desktopComposerCard}>
                      <Text style={styles.desktopComposerTitle}>Song</Text>
                      {renderTitleField()}
                    </View>
                    <View style={styles.desktopComposerCard}>
                      <Text style={styles.desktopComposerTitle}>Genre</Text>
                      {renderGenreChips(false)}
                    </View>
                    <View style={styles.desktopComposerCard}>
                      <View style={styles.sectionLabelRow}>
                        <Image
                          source={bpmIconSource}
                          style={[
                            styles.sectionLabelIcon,
                            {
                              width: bpmIconSize,
                              height: bpmIconSize,
                              borderRadius: Math.round(bpmIconSize * 0.3),
                            },
                          ]}
                          resizeMode="cover"
                          accessible={false}
                        />
                        <Text style={styles.desktopComposerTitle}>Tempo</Text>
                      </View>
                      {renderTempoControls()}
                    </View>
                    <View style={styles.desktopComposerCard}>
                      <Text style={styles.desktopComposerTitle}>Writer Notes</Text>
                      <Text style={styles.desktopHintText}>Use Writer Studio to refine structure and word choice before recording.</Text>
                      <Text style={styles.desktopHintText}>After restoring a snapshot, save when you are ready to commit changes.</Text>
                      <Text style={styles.desktopHintText}>Use Sing-back linkage after each take to close weak spots quickly.</Text>
                    </View>
                  </View>
                )}
              </View>
            ) : (
              <LyricsWriterStudio
                lyrics={editText}
                songTitle={songTitle || activeSong?.title || 'Untitled'}
                genreLabel={getGenreProfile(selectedGenre).label}
                bpm={tempoBpmText.trim() ? Number.parseInt(tempoBpmText, 10) : activeSong?.bpm}
                sessions={sessions}
                activeSongId={activeSong?.id}
                versions={lyricsVersions}
                comments={lineComments}
                captures={captureInbox}
                onCreateVersion={(note) => {
                  void handleCreateVersionSnapshot(note);
                }}
                onRestoreVersion={handleRestoreVersion}
                onDeleteVersion={(versionId) => {
                  void handleDeleteVersion(versionId);
                }}
                onUpsertComment={(lineNumber, text) => {
                  void handleUpsertLineComment(lineNumber, text);
                }}
                onDeleteComment={(commentId) => {
                  void handleDeleteLineComment(commentId);
                }}
                onAddCapture={(text) => {
                  void handleAddCapture(text);
                }}
                onToggleCapturePin={(captureId) => {
                  void handleToggleCapturePin(captureId);
                }}
                onDeleteCapture={(captureId) => {
                  void handleDeleteCapture(captureId);
                }}
                onInsertText={insertTextAtCursor}
                onJumpToLine={jumpToLineFromWriter}
                onExport={(mode) => {
                  void handleWriterExport(mode);
                }}
              />
            )}
          </View>
        )}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerMain: {
    flex: 1,
    gap: 4,
    marginRight: 12,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  headerMetaText: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  saveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  saveBadgeSaved: {
    backgroundColor: Colors.accentSubtle,
    borderColor: Colors.accentBorder,
  },
  saveBadgeSaving: {
    backgroundColor: Colors.surfaceGlass,
    borderColor: Colors.borderGlass,
  },
  saveBadgeUnsaved: {
    backgroundColor: Colors.surfaceGlass,
    borderColor: Colors.warningUnderline,
  },
  saveBadgeError: {
    backgroundColor: Colors.surfaceGlass,
    borderColor: Colors.dangerUnderline,
  },
  saveBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  saveBadgeText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  newSongButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncInfoBar: {
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 4,
  },
  syncInfoTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  syncInfoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  syncInfoLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  syncInfoText: {
    color: Colors.textTertiary,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Inter_400Regular',
  },
  syncInfoButton: {
    minHeight: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  syncInfoButtonText: {
    color: Colors.gradientStart,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  mobileFocusBar: {
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  mobileFocusLabelGroup: {
    flex: 1,
    minWidth: 0,
  },
  mobileFocusLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.7,
  },
  mobileFocusHint: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  mobileFocusToggle: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mobileFocusToggleActive: {
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentSubtle,
  },
  mobileFocusToggleText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  mobileFocusToggleTextActive: {
    color: Colors.gradientStart,
  },
  librarySection: {
    marginBottom: 12,
    gap: 8,
  },
  libraryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  libraryTitle: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
  },
  libraryHint: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  libraryScrollContent: {
    gap: 10,
    paddingRight: 20,
  },
  libraryCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 116,
    gap: 8,
  },
  libraryCardActive: {
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentSubtle,
  },
  libraryCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  libraryGenreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  libraryGenreText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  librarySongTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  librarySongTitleActive: {
    color: Colors.gradientStart,
  },
  librarySongPreview: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 16,
    minHeight: 32,
  },
  librarySongMeta: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  newDraftCard: {
    justifyContent: 'center',
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  newDraftIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newDraftTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  newDraftMeta: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  titleInput: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  titleField: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontFamily: 'Inter_500Medium',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  genreSection: {
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 8,
  },
  tempoSection: {
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 8,
  },
  tempoRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  tempoField: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  tapTempoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceGlass,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    minHeight: 44,
    minWidth: 70,
    justifyContent: 'center',
  },
  tapTempoText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  tempoHint: {
    color: Colors.textTertiary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  genreSectionLabel: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionLabelIcon: {
    width: 18,
    height: 18,
    borderRadius: 6,
  },
  genreScrollContent: {
    gap: 8,
    paddingRight: 20,
  },
  genreWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genreChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  genreChipText: {
    color: Colors.textTertiary,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabActive: {
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentSubtle,
  },
  tabText: {
    color: Colors.textTertiary,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  tabTextActive: {
    color: Colors.gradientStart,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  writeTab: {
    gap: 12,
  },
  writeDesktopLayout: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  writeDesktopLibrary: {
    width: 286,
  },
  writeDesktopMain: {
    flex: 1,
    minWidth: 0,
  },
  writeDesktopMainFocus: {
    maxWidth: 960,
    alignSelf: 'center',
  },
  writeDesktopSide: {
    width: 340,
    gap: 10,
  },
  desktopPaneCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    padding: 12,
    gap: 10,
    minHeight: 540,
  },
  desktopPaneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  desktopPaneTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  desktopPaneHint: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  desktopLibraryScroll: {
    flex: 1,
    minHeight: 0,
  },
  desktopLibraryScrollContent: {
    gap: 8,
    paddingBottom: 4,
  },
  desktopLibraryCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    padding: 10,
    gap: 8,
  },
  desktopLibraryCardDraft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  desktopLibraryCardActive: {
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentSubtle,
  },
  desktopLibraryCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  desktopLibraryNewIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktopLibraryCardBody: {
    gap: 4,
  },
  desktopLibraryTitle: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  desktopLibraryTitleActive: {
    color: Colors.gradientStart,
  },
  desktopLibraryPreview: {
    color: Colors.textTertiary,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Inter_400Regular',
  },
  desktopLibraryMeta: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
  },
  editorToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  editorToolbarLeft: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  editorToolbarTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  editorToolbarHint: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  editorToolbarStatus: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  editorToolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  editorToolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  editorToolbarButtonText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  findPanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    padding: 10,
    gap: 8,
    marginBottom: 10,
  },
  findHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  findHeaderLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.6,
  },
  findCountText: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  findInput: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  findActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  findBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  findBtnDisabled: {
    opacity: 0.45,
  },
  findBtnText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  ipadPaperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  ipadPaperBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentSubtle,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  ipadPaperBadgeText: {
    color: Colors.gradientStart,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  ipadPaperToggle: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    justifyContent: 'center',
  },
  ipadPaperToggleActive: {
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentSubtle,
  },
  ipadPaperToggleText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  ipadPaperToggleTextActive: {
    color: Colors.gradientStart,
  },
  paperEditorShell: {
    position: 'relative',
  },
  paperEditorShellActive: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7c9a3',
    backgroundColor: '#fdf7e6',
    overflow: 'hidden',
    shadowColor: '#171717',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  paperLinesOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.7,
  },
  paperGuideLine: {
    position: 'absolute',
    left: 14,
    right: 14,
    height: 1,
    backgroundColor: '#d9caa1',
  },
  lyricsEditorIpad: {
    minHeight: 500,
    fontSize: 19,
    lineHeight: PAPER_LINE_HEIGHT,
  },
  lyricsEditorPaper: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: '#2a2520',
    fontFamily: 'Georgia',
    paddingTop: 16,
  },
  paperHintText: {
    color: Colors.textTertiary,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
    marginTop: -4,
  },
  desktopMainCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    padding: 12,
    gap: 10,
    flex: 1,
  },
  desktopMainScroll: {
    flex: 1,
    minHeight: 0,
  },
  desktopMainScrollContent: {
    gap: 10,
    paddingBottom: 4,
  },
  desktopComposerCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    padding: 12,
    gap: 8,
  },
  desktopComposerTitle: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.7,
  },
  lyricsEditor: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    lineHeight: 28,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    minHeight: 280,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  lyricsEditorDesktop: {
    minHeight: 540,
  },
  lyricsEditorMobileFocus: {
    minHeight: 420,
  },
  sectionNavigatorList: {
    maxHeight: 180,
  },
  sectionNavigatorListContent: {
    gap: 6,
  },
  sectionNavigatorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sectionNavigatorItemText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  desktopHintText: {
    color: Colors.textTertiary,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Inter_400Regular',
  },
  sectionGoalItem: {
    gap: 2,
    paddingVertical: 2,
  },
  sectionGoalLabel: {
    color: Colors.gradientStart,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  sectionGoalText: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  mobileSectionGoalCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    padding: 12,
    gap: 6,
  },
  insertRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  insertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surfaceGlass,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  insertBtnText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  structureTab: {
    gap: 10,
  },
  emptyStruct: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyStructText: {
    color: Colors.textTertiary,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  importTab: {
    gap: 16,
  },
  writerTab: {
    gap: 12,
  },
  importEditor: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    lineHeight: 28,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    minHeight: 240,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  importEditorDesktop: {
    minHeight: 0,
    flex: 1,
  },
  importBtn: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.accentBorder,
  },
  importBtnDisabled: {
    opacity: 0.4,
  },
  importBtnText: {
    color: Colors.gradientStart,
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
});
