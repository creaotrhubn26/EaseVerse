import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { genreList, type GenreId } from '@/constants/genres';
import SectionCard from '@/components/SectionCard';
import { useApp } from '@/lib/AppContext';
import { generateId } from '@/lib/storage';
import type { Song, SongSection } from '@/lib/types';

type TabKey = 'write' | 'structure' | 'import';

export default function LyricsScreen() {
  const insets = useSafeAreaInsets();
  const { activeSong, songs, addSong, updateSong, setActiveSong } = useApp();
  const [activeTab, setActiveTab] = useState<TabKey>('write');
  const [editText, setEditText] = useState(activeSong?.lyrics || '');
  const [importText, setImportText] = useState('');
  const [songTitle, setSongTitle] = useState(activeSong?.title || '');
  const [selectedGenre, setSelectedGenre] = useState<GenreId>(activeSong?.genre || 'pop');

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  React.useEffect(() => {
    setEditText(activeSong?.lyrics || '');
    setSongTitle(activeSong?.title || '');
    setSelectedGenre(activeSong?.genre || 'pop');
  }, [activeSong?.id]);

  const parseSections = useCallback((text: string): SongSection[] => {
    const lines = text.split('\n').filter(l => l.trim());
    const sections: SongSection[] = [];
    let currentLines: string[] = [];
    let sectionCount = 0;

    for (const line of lines) {
      currentLines.push(line);
      if (currentLines.length === 4 || lines.indexOf(line) === lines.length - 1) {
        sectionCount++;
        const type = sectionCount % 3 === 2 ? 'chorus' : sectionCount % 3 === 0 ? 'bridge' : 'verse';
        const label = type === 'chorus' ? 'Chorus' : type === 'bridge' ? `Bridge` : `Verse ${Math.ceil(sectionCount / 3) + (sectionCount % 3 === 1 ? 0 : -1) + 1}`;
        sections.push({
          id: generateId(),
          type,
          label: type === 'verse' ? `Verse ${sections.filter(s => s.type === 'verse').length + 1}` : type === 'chorus' ? 'Chorus' : 'Bridge',
          lines: [...currentLines],
        });
        currentLines = [];
      }
    }
    return sections;
  }, []);

  const handleSave = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const sections = parseSections(editText);
    if (activeSong) {
      const updated: Song = {
        ...activeSong,
        title: songTitle || 'Untitled',
        lyrics: editText,
        genre: selectedGenre,
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
        sections,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      addSong(newSong);
      setActiveSong(newSong);
    }
  }, [editText, songTitle, activeSong, parseSections, selectedGenre]);

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
    setActiveSong(null);
    setActiveTab('write');
  };

  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'write', label: 'Write', icon: 'edit-3' },
    { key: 'structure', label: 'Structure', icon: 'layers' },
    { key: 'import', label: 'Import', icon: 'download' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Lyrics</Text>
        <Pressable onPress={handleNewSong} hitSlop={12}>
          <Ionicons name="add-circle-outline" size={26} color={Colors.gradientStart} />
        </Pressable>
      </View>

      <View style={styles.titleInput}>
        <TextInput
          value={songTitle}
          onChangeText={setSongTitle}
          placeholder="Song title"
          placeholderTextColor={Colors.textTertiary}
          style={styles.titleField}
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
              >
                <Ionicons name={g.icon as any} size={14} color={isSelected ? g.color : Colors.textTertiary} />
                <Text style={[styles.genreChipText, isSelected && { color: g.color }]}>
                  {g.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
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
          >
            <Feather
              name={tab.icon as any}
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
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, webBottomInset) + 100 }}
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
            />
            <View style={styles.insertRow}>
              {['verse', 'chorus', 'bridge'].map(type => (
                <Pressable
                  key={type}
                  style={styles.insertBtn}
                  onPress={() => handleInsertSection(type)}
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
            />
            <Pressable
              style={[styles.importBtn, !importText.trim() && styles.importBtnDisabled]}
              onPress={handleImport}
              disabled={!importText.trim()}
            >
              <Text style={styles.importBtnText}>Use Pasted Lyrics</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomAction, { paddingBottom: Math.max(insets.bottom, webBottomInset) + 90 }]}>
        <Pressable onPress={handleSave} style={styles.savePressable}>
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.saveBtn}
          >
            <Ionicons name="checkmark" size={20} color="#fff" />
            <Text style={styles.saveBtnText}>Save & Use for Live</Text>
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
  bottomAction: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  savePressable: {
    borderRadius: 14,
    overflow: 'hidden',
    boxShadow: `0px 4px 12px ${Colors.accentGlow}`,
    elevation: 6,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
});
