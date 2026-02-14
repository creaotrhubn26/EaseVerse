import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  Pressable,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { getGenreProfile } from '@/constants/genres';
import type { Song } from '@/lib/types';

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

export default function SongPickerModal({ visible, songs, activeSongId, onSelect, onClose }: SongPickerModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close song picker"
          accessibilityHint="Dismisses the song selection sheet"
        />
        <View style={styles.sheet}>
          <View style={styles.handle} accessible={false} />
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">Select Song</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close song picker"
              accessibilityHint="Dismisses the song selection sheet"
            >
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <FlatList
            data={songs}
            keyExtractor={item => item.id}
            scrollEnabled={songs.length > 4}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const isActive = item.id === activeSongId;
              const lineCount = item.lyrics.split('\n').filter(l => l.trim()).length;
              const gp = item.genre ? getGenreProfile(item.genre) : null;
              return (
                <Pressable
                  style={[styles.songItem, isActive && styles.songItemActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onSelect(item);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Select song ${item.title}`}
                  accessibilityHint={`${lineCount} lines. Updated ${formatDate(item.updatedAt)}.`}
                  accessibilityState={{ selected: isActive }}
                >
                  <View style={[styles.songIcon, gp && { backgroundColor: gp.accentColor }]}>
                    <Ionicons
                      name={gp ? gp.icon : 'musical-notes'}
                      size={20}
                      color={isActive ? Colors.gradientStart : gp ? gp.color : Colors.textTertiary}
                    />
                  </View>
                  <View style={styles.songInfo}>
                    <Text style={[styles.songTitle, isActive && styles.songTitleActive]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.songMeta}>
                      {gp ? gp.label + '  ' : ''}{lineCount} lines  {formatDate(item.updatedAt)}
                    </Text>
                  </View>
                  {isActive && (
                    <Ionicons name="checkmark-circle" size={22} color={Colors.gradientStart} />
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="musical-notes-outline" size={40} color={Colors.textTertiary} accessible={false} />
                <Text style={styles.emptyText}>No songs yet</Text>
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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '60%',
    paddingBottom: 34,
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
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderGlass,
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
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 2,
  },
  songItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 12,
  },
  songItemActive: {
    backgroundColor: Colors.accentSubtle,
  },
  songIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  songInfo: {
    flex: 1,
    gap: 2,
  },
  songTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
  songTitleActive: {
    color: Colors.gradientStart,
    fontFamily: 'Inter_600SemiBold',
  },
  songMeta: {
    color: Colors.textTertiary,
    fontSize: 13,
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
