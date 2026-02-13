import React, { useRef } from 'react';
import { StyleSheet, View, Pressable, Animated, Text } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import SessionCard from './SessionCard';
import type { Session } from '@/lib/types';

interface SwipeableSessionCardProps {
  session: Session;
  onPress: () => void;
  onFavorite: () => void;
  onDelete: () => void;
}

export default function SwipeableSessionCard({ session, onPress, onFavorite, onDelete }: SwipeableSessionCardProps) {
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0.6],
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
      >
        <Animated.View style={[styles.deleteContent, { transform: [{ scale }] }]}>
          <Ionicons name="trash-outline" size={22} color="#fff" />
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

    return (
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          swipeableRef.current?.close();
          onFavorite();
        }}
        style={styles.favoriteAction}
      >
        <Animated.View style={[styles.favoriteContent, { transform: [{ scale }] }]}>
          <Ionicons
            name={session.favorite ? 'heart-dislike' : 'heart'}
            size={22}
            color="#fff"
          />
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
  },
});
