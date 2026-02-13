import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import SessionCard from '@/components/SessionCard';
import { useApp } from '@/lib/AppContext';

type FilterKey = 'latest' | 'best' | 'flagged';

export default function SessionsScreen() {
  const insets = useSafeAreaInsets();
  const { sessions, toggleFavorite, removeSession } = useApp();
  const [filter, setFilter] = useState<FilterKey>('latest');

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  const filteredSessions = useMemo(() => {
    let list = [...sessions];
    switch (filter) {
      case 'best':
        list.sort((a, b) => b.insights.textAccuracy - a.insights.textAccuracy);
        break;
      case 'flagged':
        list = list.filter(s => s.favorite);
        break;
      default:
        list.sort((a, b) => b.date - a.date);
    }
    return list;
  }, [sessions, filter]);

  const filters: { key: FilterKey; label: string }[] = [
    { key: 'latest', label: 'Latest' },
    { key: 'best', label: 'Best' },
    { key: 'flagged', label: 'Flagged' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Sessions</Text>
        <Text style={styles.sessionCount}>{sessions.length} recordings</Text>
      </View>

      <View style={styles.filterRow}>
        {filters.map(f => (
          <Pressable
            key={f.key}
            style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
            onPress={() => {
              setFilter(f.key);
              Haptics.selectionAsync();
            }}
          >
            <Text
              style={[
                styles.filterText,
                filter === f.key && styles.filterTextActive,
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filteredSessions}
        keyExtractor={item => item.id}
        scrollEnabled={filteredSessions.length > 0}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, webBottomInset) + 100,
          gap: 10,
        }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <SessionCard
            session={item}
            onPress={() => router.push({ pathname: '/session/[id]', params: { id: item.id } })}
            onFavorite={() => toggleFavorite(item.id)}
            onDelete={() => removeSession(item.id)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="mic-off-outline" size={48} color={Colors.textTertiary} />
            <Text style={styles.emptyTitle}>No sessions yet</Text>
            <Text style={styles.emptySubtext}>Start singing to create your first session</Text>
          </View>
        }
      />
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
  sessionCount: {
    color: Colors.textTertiary,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 16,
  },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterBtnActive: {
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentSubtle,
  },
  filterText: {
    color: Colors.textTertiary,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  filterTextActive: {
    color: Colors.gradientStart,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyTitle: {
    color: Colors.textSecondary,
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
  },
  emptySubtext: {
    color: Colors.textTertiary,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
});
