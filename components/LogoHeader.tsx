import React from 'react';
import { Animated, Easing, Image, Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { tierValue, useResponsiveLayout } from '@/lib/responsive';

type LogoHeaderVariant = 'compact' | 'hero';

type LogoHeaderProps = {
  variant?: LogoHeaderVariant;
  style?: StyleProp<ViewStyle>;
};

const logoSource =
  Platform.OS === 'web'
    ? require('@/assets/images/easeverse_logo_App.web.png')
    : require('@/assets/images/easeverse_logo_App.png');

export default function LogoHeader({ variant = 'compact', style }: LogoHeaderProps) {
  const responsive = useResponsiveLayout();
  const motionAnim = React.useRef(new Animated.Value(0)).current;
  const useNativeDriver = Platform.OS !== 'web';

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(motionAnim, {
          toValue: 1,
          duration: 1700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver,
        }),
        Animated.timing(motionAnim, {
          toValue: 0,
          duration: 1700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [motionAnim, useNativeDriver]);
  const baseHeight =
    variant === 'compact'
      ? tierValue(responsive.tier, [52, 58, 68, 80, 128, 156, 190])
      : tierValue(responsive.tier, [84, 96, 112, 132, 210, 260, 320]);
  const baseMaxWidth = tierValue(responsive.tier, [320, 360, 420, 560, 900, 1200, 1500]);
  const highResBoost =
    responsive.isWeb && responsive.width >= 2560
      ? 1.5
      : responsive.isWeb && responsive.width >= 1920
        ? 1.35
        : 1;
  const height = Math.round(baseHeight * highResBoost);
  const maxWidth = Math.round(baseMaxWidth * highResBoost);
  const animatedStyle = {
    transform: [
      {
        translateY: motionAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -3],
        }),
      },
      {
        translateX: motionAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-2, 2],
        }),
      },
      {
        rotate: motionAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ['-1.1deg', '1.1deg'],
        }),
      },
      {
        scale: motionAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.02],
        }),
      },
    ],
  };

  return (
    <Animated.View style={[styles.logoHeader, { height, maxWidth }, animatedStyle, style]}>
      <Image
        source={logoSource}
        style={styles.logo}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="EaseVerse logo"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  logoHeader: {
    width: '100%',
    paddingHorizontal: 0,
    marginBottom: 8,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
});
