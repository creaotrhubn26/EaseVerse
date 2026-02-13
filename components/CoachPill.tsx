import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import Colors from '@/constants/colors';

interface CoachPillProps {
  hint: string | null;
  visible: boolean;
}

export default function CoachPill({ hint, visible }: CoachPillProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);

  useEffect(() => {
    if (visible && hint) {
      opacity.value = withDelay(100, withTiming(1, { duration: 200 }));
      translateY.value = withDelay(100, withTiming(0, { duration: 200 }));
    } else {
      opacity.value = withTiming(0, { duration: 150 });
      translateY.value = withTiming(8, { duration: 150 });
    }
  }, [visible, hint]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!hint) return null;

  return (
    <Animated.View style={[styles.pill, animStyle]}>
      <View style={styles.iconWrap}>
        <Feather name="zap" size={14} color={Colors.gradientStart} />
      </View>
      <Text style={styles.text}>{hint}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.accentSubtle,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    alignSelf: 'center',
  },
  iconWrap: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  text: {
    color: Colors.gradientEnd,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
});
