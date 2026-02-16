import React, { useRef } from 'react';
import { StyleSheet, View, Pressable, Animated, Text } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import SessionCard from './SessionCard';
import type { Session } from '@/lib/types';
import { scaledIconSize, useResponsiveLayout } from '@/lib/responsive';

interface SwipeableSessionCardProps {
  session: Session;
  onPress: () => void;
  onFavorite: () => void;
  onDelete: () => void;
}

export default function SwipeableSessionCard({ session, onPress, onFavorite, onDelete }: SwipeableSessionCardProps) {
  const responsive = useResponsiveLayout();
  const swipeableRef = useRef<Swipeable>(null);
  const actionIconSize = scaledIconSize(14, responsive);

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0.6],
      extrapolate: 'clamp',
    });

    const opacity = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.5, 1],
      extrapolate: 'clamp',
    });

    return (
      <Pressable
        onPress={() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          swipeableRef.current?.close();
          onDelete();
        }}
        style={styles.deleteAction}
        accessibilityRole="button"
        accessibilityLabel="Delete session"
        accessibilityHint="Removes this recording from your sessions"
      >
        <Animated.View style={[styles.deleteContent, { transform: [{ scale }], opacity }]}>
          <Ionicons name="trash-outline" size={actionIconSize} color="#fff" />
          <Text style={styles.actionLabel}>Delete</Text>
        </Animated.View>
      </Pressable>
    );
  };

  const renderLeftActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({
      inputRange: [0, 80],
      outputRange: [0.6, 1],
      extrapolate: 'clamp',
    });

    const opacity = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.5, 1],
      extrapolate: 'clamp',
    });

    return (
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          swipeableRef.current?.close();
          onFavorite();
        }}
        style={styles.favoriteAction}
        accessibilityRole="button"
        accessibilityLabel={session.favorite ? 'Remove favorite' : 'Mark as favorite'}
        accessibilityHint="Adds or removes this session from flagged sessions"
        accessibilityState={{ selected: session.favorite }}
      >
        <Animated.View style={[styles.favoriteContent, { transform: [{ scale }], opacity }]}>
          <View>
            <Ionicons
              name={session.favorite ? 'heart-dislike' : 'heart'}
              size={actionIconSize}
              color="#fff"
            />
          </View>
          <Text style={styles.actionLabel}>{session.favorite ? 'Unfave' : 'Fave'}</Text>
        </Animated.View>
      </Pressable>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
      overshootRight={false}
      overshootLeft={false}
      friction={2}
    >
      <SessionCard
        session={session}
        onPress={onPress}
        onFavorite={onFavorite}
        onDelete={onDelete}
      />
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  deleteAction: {
    width: 72,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.dangerUnderline,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    marginLeft: -8,
  },
  deleteContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  favoriteAction: {
    width: 72,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.gradientStart,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    marginRight: -8,
  },
  favoriteContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
  },
});
