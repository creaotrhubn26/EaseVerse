import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  Pressable,
  FlatList,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { getGenreProfile } from '@/constants/genres';
import type { Song } from '@/lib/types';
import { scaledIconSize, useResponsiveLayout } from '@/lib/responsive';

interface SongPickerModalProps {
  visible: boolean;
  songs: Song[];
  activeSongId?: string;
  onSelect: (song: Song) => void;
  onClose: () => void;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function firstLyricLine(lyrics: string): string {
  const line = lyrics
    .split('\n')
    .map((segment) => segment.trim())
    .find((segment) => segment.length > 0);
  return line || 'No lyric lines yet';
}

export default function SongPickerModal({ visible, songs, activeSongId, onSelect, onClose }: SongPickerModalProps) {
  const [search, setSearch] = useState('');
  const responsive = useResponsiveLayout();
  const isDesktopFullscreen = responsive.isWeb && responsive.tier >= 5;
  const listColumns = isDesktopFullscreen ? 2 : 1;
  const closeIconSize = scaledIconSize(16, responsive);
  const searchIconSize = scaledIconSize(11, responsive);
  const songIconSize = scaledIconSize(13, responsive);
  const checkIconSize = scaledIconSize(11, responsive);
  const chevronIconSize = scaledIconSize(10, responsive);
  const emptyIconSize = scaledIconSize(26, responsive);

  useEffect(() => {
    if (visible) {
      setSearch('');
    }
  }, [visible]);

  const normalizedSearch = search.trim().toLowerCase();

  const visibleSongs = useMemo(() => {
    const sorted = [...songs].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!normalizedSearch) {
      return sorted;
    }

    return sorted.filter((song) => {
      const genreLabel = song.genre ? getGenreProfile(song.genre).label : '';
      return (
        song.title.toLowerCase().includes(normalizedSearch) ||
        genreLabel.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [songs, normalizedSearch]);

  const songCountLabel = `${songs.length} song${songs.length === 1 ? '' : 's'}`;
  const resultCountLabel = `${visibleSongs.length} result${visibleSongs.length === 1 ? '' : 's'}`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={[styles.overlay, isDesktopFullscreen && styles.overlayDesktop]}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close song picker"
          accessibilityHint="Dismisses the song selection sheet"
        />
        <View style={[styles.sheet, isDesktopFullscreen && styles.sheetDesktop]}>
          {!isDesktopFullscreen && <View style={styles.handle} accessible={false} />}
          <View style={styles.header}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title} accessibilityRole="header">Select Song</Text>
              <Text style={styles.subtitle}>
                {normalizedSearch ? `${resultCountLabel} found` : `Recent first · ${songCountLabel}`}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close song picker"
              accessibilityHint="Dismisses the song selection sheet"
            >
              <Ionicons name="close" size={closeIconSize} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={searchIconSize} color={Colors.textTertiary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search title or genre"
              placeholderTextColor={Colors.textTertiary}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search songs"
              accessibilityHint="Filters songs by title or genre"
            />
            {search.length > 0 && (
              <Pressable
                hitSlop={10}
                onPress={() => setSearch('')}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                accessibilityHint="Clears song search filter"
              >
                <Ionicons name="close-circle" size={searchIconSize + 2} color={Colors.textTertiary} />
              </Pressable>
            )}
          </View>

          <FlatList
            key={`song-list-${listColumns}`}
            data={visibleSongs}
            numColumns={listColumns}
            columnWrapperStyle={listColumns > 1 ? styles.columnWrap : undefined}
            keyExtractor={item => item.id}
            scrollEnabled={visibleSongs.length > 4}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const isActive = item.id === activeSongId;
              const lineCount = item.lyrics.split('\n').filter(l => l.trim()).length;
              const gp = item.genre ? getGenreProfile(item.genre) : null;
              const bpmLabel =
                typeof item.bpm === 'number' && Number.isFinite(item.bpm) ? `${Math.round(item.bpm)} BPM` : '';
              const lyricPreview = firstLyricLine(item.lyrics);
              return (
                <Pressable
                  style={[
                    styles.songItem,
                    listColumns > 1 && styles.songItemGrid,
                    isActive && styles.songItemActive,
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onSelect(item);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Select song ${item.title}`}
                  accessibilityHint={
                    `${lineCount} lines.` +
                    (bpmLabel ? ` Tempo ${bpmLabel}.` : '') +
                    ` Updated ${formatDate(item.updatedAt)}.`
                  }
                  accessibilityState={{ selected: isActive }}
                >
                  <View style={styles.songTopRow}>
                    <View
                      style={[
                        styles.songIcon,
                        gp && { backgroundColor: gp.accentColor, borderColor: `${gp.color}66` },
                      ]}
                    >
                      <Ionicons
                        name={gp ? gp.icon : 'musical-notes'}
                        size={songIconSize}
                        color={gp ? gp.color : Colors.textTertiary}
                      />
                    </View>
                    <View style={styles.songInfo}>
                      <Text style={[styles.songTitle, isActive && styles.songTitleActive]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.songPreview} numberOfLines={1}>
                        {lyricPreview}
                      </Text>
                    </View>
                    {isActive ? (
                      <View style={styles.activePill}>
                        <Ionicons name="checkmark-circle" size={checkIconSize} color={Colors.gradientStart} />
                        <Text style={styles.activePillText}>Active</Text>
                      </View>
                    ) : (
                      <Ionicons name="chevron-forward" size={chevronIconSize} color={Colors.textTertiary} />
                    )}
                  </View>
                  <View style={styles.songMetaRow}>
                    <View style={styles.songMetaPill}>
                      <Ionicons name="list-outline" size={scaledIconSize(8, responsive)} color={Colors.textTertiary} />
                      <Text style={styles.songMetaText}>{lineCount} lines</Text>
                    </View>
                    {gp && (
                      <View style={styles.songMetaPill}>
                        <Ionicons name="musical-note-outline" size={scaledIconSize(8, responsive)} color={gp.color} />
                        <Text style={[styles.songMetaText, { color: Colors.textSecondary }]}>{gp.label}</Text>
                      </View>
                    )}
                    {bpmLabel ? (
                      <View style={styles.songMetaPill}>
                        <Ionicons name="speedometer-outline" size={scaledIconSize(8, responsive)} color={Colors.textTertiary} />
                        <Text style={styles.songMetaText}>{bpmLabel}</Text>
                      </View>
                    ) : null}
                    <View style={styles.songMetaPill}>
                      <Ionicons name="time-outline" size={scaledIconSize(8, responsive)} color={Colors.textTertiary} />
                      <Text style={styles.songMetaText}>{formatDate(item.updatedAt)}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="musical-notes-outline" size={emptyIconSize} color={Colors.textTertiary} accessible={false} />
                <Text style={styles.emptyText}>
                  {songs.length === 0 ? 'No songs yet' : 'No songs match your search'}
                </Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlayDesktop: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '74%',
    paddingBottom: 34,
  },
  sheetDesktop: {
    width: '96%',
    maxWidth: 1520,
    height: '92%',
    maxHeight: '92%',
    borderRadius: 20,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderGlass,
  },
  headerTextWrap: {
    flex: 1,
    gap: 4,
    paddingTop: 6,
  },
  closeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
  },
  subtitle: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  searchWrap: {
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 2,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    paddingVertical: 10,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 20,
    gap: 8,
  },
  columnWrap: {
    gap: 10,
  },
  songItem: {
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  songItemGrid: {
    flex: 1,
    minHeight: 122,
  },
  songItemActive: {
    backgroundColor: Colors.accentSubtle,
    borderColor: Colors.accentBorder,
  },
  songTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  songIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  songInfo: {
    flex: 1,
    gap: 3,
  },
  songTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  songTitleActive: {
    color: Colors.gradientStart,
    fontFamily: 'Inter_600SemiBold',
  },
  songPreview: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentSubtle,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  activePillText: {
    color: Colors.gradientStart,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  songMetaRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  songMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  songMetaText: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyText: {
    color: Colors.textTertiary,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
});
