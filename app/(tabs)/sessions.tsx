import React, { useState, useMemo, useCallback, ComponentProps } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import SwipeableSessionCard from '@/components/SwipeableSessionCard';
import LogoHeader from '@/components/LogoHeader';
import { useApp } from '@/lib/AppContext';

type FilterKey = 'latest' | 'best' | 'flagged';

export default function SessionsScreen() {
  const insets = useSafeAreaInsets();
  const { sessions, toggleFavorite, removeSession } = useApp();
  const [filter, setFilter] = useState<FilterKey>('latest');
  const [refreshing, setRefreshing] = useState(false);

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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const filters: { key: FilterKey; label: string; icon: ComponentProps<typeof Ionicons>['name'] }[] = [
    { key: 'latest', label: 'Latest', icon: 'time-outline' },
    { key: 'best', label: 'Best', icon: 'trophy-outline' },
    { key: 'flagged', label: 'Flagged', icon: 'heart-outline' },
  ];

  const bestScore = sessions.length > 0
    ? Math.max(...sessions.map(s => s.insights.textAccuracy))
    : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <LogoHeader />
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">Sessions</Text>
        <View style={styles.headerStats}>
          <View style={styles.statPill}>
            <Text style={styles.statNumber}>{sessions.length}</Text>
            <Text style={styles.statLabel}>recordings</Text>
          </View>
          {bestScore > 0 && (
            <View style={styles.statPill}>
              <Text style={[styles.statNumber, { color: Colors.successUnderline }]}>{bestScore}%</Text>
              <Text style={styles.statLabel}>best</Text>
            </View>
          )}
        </View>
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
            accessibilityRole="button"
            accessibilityLabel={`Filter by ${f.label}`}
            accessibilityHint="Updates the sessions list"
            accessibilityState={{ selected: filter === f.key }}
          >
            <Ionicons
              name={f.icon}
              size={14}
              color={filter === f.key ? Colors.gradientStart : Colors.textTertiary}
            />
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.gradientStart}
          />
        }
        renderItem={({ item }) => (
          <SwipeableSessionCard
            session={item}
            onPress={() => router.push({ pathname: '/session/[id]', params: { id: item.id } })}
            onFavorite={() => toggleFavorite(item.id)}
            onDelete={() => removeSession(item.id)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="mic-off-outline" size={44} color={Colors.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>No sessions yet</Text>
            <Text style={styles.emptySubtext}>
              {filter === 'flagged'
                ? 'Swipe right on a session to flag it'
                : 'Start singing to create your first session'}
            </Text>
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
    gap: 8,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
  },
  headerStats: {
    flexDirection: 'row',
    gap: 12,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statNumber: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  statLabel: {
    color: Colors.textTertiary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 16,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 44,
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
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surfaceGlass,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
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
    paddingHorizontal: 20,
  },
});
