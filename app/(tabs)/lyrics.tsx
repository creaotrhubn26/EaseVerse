import React, { useState, useCallback, useEffect, useRef, ComponentProps } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { genreList, type GenreId } from '@/constants/genres';
import SectionCard from '@/components/SectionCard';
import Toast from '@/components/Toast';
import LogoHeader from '@/components/LogoHeader';
import { useApp } from '@/lib/AppContext';
import { generateId } from '@/lib/storage';
import { parseSongSections } from '@/lib/lyrics-sections';
import type { Song } from '@/lib/types';

const AUTOSAVE_DEBOUNCE_MS = 700;
const TOAST_THROTTLE_MS = 15000;

type TabKey = 'write' | 'structure' | 'import';

export default function LyricsScreen() {
  const insets = useSafeAreaInsets();
  const { activeSong, songs, addSong, updateSong, setActiveSong } = useApp();
  const [activeTab, setActiveTab] = useState<TabKey>('write');
  const [editText, setEditText] = useState(activeSong?.lyrics || '');
  const [importText, setImportText] = useState('');
  const [songTitle, setSongTitle] = useState(activeSong?.title || '');
  const [selectedGenre, setSelectedGenre] = useState<GenreId>(activeSong?.genre || 'pop');
  const [tempoBpmText, setTempoBpmText] = useState(activeSong?.bpm ? String(activeSong.bpm) : '');
  const [toast, setToast] = useState<{ visible: boolean; message: string; variant?: 'success' | 'error' }>({
    visible: false,
    message: '',
  });
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);
  const lastToastTimeRef = useRef(0);
  const tapTempoRef = useRef<number[]>([]);

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  React.useEffect(() => {
    setEditText(activeSong?.lyrics || '');
    setSongTitle(activeSong?.title || '');
    setSelectedGenre(activeSong?.genre || 'pop');
    setTempoBpmText(activeSong?.bpm ? String(activeSong.bpm) : '');
  }, [activeSong?.id, activeSong?.lyrics, activeSong?.title, activeSong?.genre, activeSong?.bpm]);

  const performSave = useCallback(() => {
    if (!editText.trim()) return;

    const duplicate = songs.find(s => s.title.toLowerCase() === (songTitle || 'Untitled').toLowerCase() && s.id !== activeSong?.id);
    if (duplicate) {
      setToast({ visible: true, message: 'Duplicate title – choose a different name', variant: 'error' });
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const sections = parseSongSections(editText);
    const parsedBpm = tempoBpmText.trim()
      ? Math.max(30, Math.min(300, parseInt(tempoBpmText, 10)))
      : undefined;

    if (activeSong) {
      const updated: Song = {
        ...activeSong,
        title: songTitle || 'Untitled',
        lyrics: editText,
        genre: selectedGenre,
        bpm: parsedBpm,
        sections,
        updatedAt: Date.now(),
      };
      updateSong(updated);
      setActiveSong(updated);
    } else {
      const newSong: Song = {
        id: generateId(),
        title: songTitle || 'Untitled',
        lyrics: editText,
        genre: selectedGenre,
        bpm: parsedBpm,
        sections,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      addSong(newSong);
      setActiveSong(newSong);
    }

    const now = Date.now();
    if (now - lastToastTimeRef.current >= TOAST_THROTTLE_MS) {
      lastToastTimeRef.current = now;
      setToast({ visible: true, message: 'Saved & ready for live' });
    }
  }, [editText, songTitle, activeSong, selectedGenre, tempoBpmText, songs, updateSong, addSong, setActiveSong]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    if (!editText.trim()) return;

    autosaveTimerRef.current = setTimeout(() => {
      performSave();
      autosaveTimerRef.current = null;
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [editText, songTitle, selectedGenre, tempoBpmText, performSave]);

  const handleImport = useCallback(() => {
    if (!importText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEditText(importText);
    setActiveTab('write');
    setImportText('');
  }, [importText]);

  const handleInsertSection = (type: string) => {
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    setEditText(prev => prev + (prev ? '\n\n' : '') + `[${label}]\n`);
    Haptics.selectionAsync();
  };

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

  const handleNewSong = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEditText('');
    setSongTitle('');
    setSelectedGenre('pop');
    setTempoBpmText('');
    setActiveSong(null);
    setActiveTab('write');
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

  const tabs: { key: TabKey; label: string; icon: ComponentProps<typeof Feather>['name'] }[] = [
    { key: 'write', label: 'Write', icon: 'edit-3' },
    { key: 'structure', label: 'Structure', icon: 'layers' },
    { key: 'import', label: 'Import', icon: 'download' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <LogoHeader />
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">Lyrics</Text>
        <Pressable
          onPress={handleNewSong}
          hitSlop={12}
          style={styles.newSongButton}
          accessibilityRole="button"
          accessibilityLabel="Create new song"
          accessibilityHint="Clears the current draft and starts a new song"
        >
          <Ionicons name="add-circle-outline" size={26} color={Colors.gradientStart} />
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

      <View style={styles.titleInput}>
        <TextInput
          value={songTitle}
          onChangeText={setSongTitle}
          placeholder="Song title"
          placeholderTextColor={Colors.textTertiary}
          style={styles.titleField}
          accessibilityLabel="Song title"
          accessibilityHint="Enter a title for your song"
        />
      </View>

      <View style={styles.genreSection}>
        <Text style={styles.genreSectionLabel}>Genre</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.genreScrollContent}
        >
          {genreList.map(g => {
            const isSelected = selectedGenre === g.id;
            return (
              <Pressable
                key={g.id}
                style={[
                  styles.genreChip,
                  isSelected && { backgroundColor: g.accentColor, borderColor: g.color },
                ]}
                onPress={() => {
                  setSelectedGenre(g.id);
                  Haptics.selectionAsync();
                }}
                accessibilityRole="button"
                accessibilityLabel={`Select ${g.label} genre`}
                accessibilityHint="Applies coaching defaults for this style"
                accessibilityState={{ selected: isSelected }}
              >
                <Ionicons name={g.icon} size={14} color={isSelected ? g.color : Colors.textTertiary} />
                <Text style={[styles.genreChipText, isSelected && { color: g.color }]}>
                  {g.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.tempoSection}>
        <Text style={styles.genreSectionLabel}>Tempo (BPM)</Text>
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
            <Feather name="activity" size={16} color={Colors.textSecondary} />
            <Text style={styles.tapTempoText}>Tap</Text>
          </Pressable>
        </View>
        <Text style={styles.tempoHint}>
          Used for count-in tempo (and upcoming timing coaching).
        </Text>
      </View>

      <View style={styles.tabBar}>
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
              size={16}
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

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, webBottomInset) + 24 }}
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'write' && (
          <View style={styles.writeTab}>
            <TextInput
              value={editText}
              onChangeText={setEditText}
              placeholder="Write your lyrics here..."
              placeholderTextColor={Colors.textTertiary}
              style={styles.lyricsEditor}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Lyrics editor"
              accessibilityHint="Write song lyrics and section headers"
            />
            <View style={styles.insertRow}>
              {['verse', 'chorus', 'bridge'].map(type => (
                <Pressable
                  key={type}
                  style={styles.insertBtn}
                  onPress={() => handleInsertSection(type)}
                  accessibilityRole="button"
                  accessibilityLabel={`Insert ${type} section`}
                  accessibilityHint="Adds a section header in the lyrics editor"
                >
                  <Ionicons name="add" size={14} color={Colors.textSecondary} />
                  <Text style={styles.insertBtnText}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {activeTab === 'structure' && (
          <View style={styles.structureTab}>
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
                <Feather name="layers" size={40} color={Colors.textTertiary} />
                <Text style={styles.emptyStructText}>
                  Write lyrics first to see structure
                </Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'import' && (
          <View style={styles.importTab}>
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
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
  },
  newSongButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  genreScrollContent: {
    gap: 8,
    paddingRight: 20,
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
  insertRow: {
    flexDirection: 'row',
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
