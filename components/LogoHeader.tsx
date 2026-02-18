import React from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

type LogoHeaderVariant = 'compact' | 'hero';

type LogoHeaderProps = {
  variant?: LogoHeaderVariant;
  style?: StyleProp<ViewStyle>;
};

const variantHeight: Record<LogoHeaderVariant, number> = {
  compact: 56,
  hero: 92,
};

export default function LogoHeader({ variant = 'compact', style }: LogoHeaderProps) {
  return (
    <View style={[styles.logoHeader, { height: variantHeight[variant] }, style]}>
      <Image
        source={require('@/assets/images/easeverse_logo_App.png')}
        style={styles.logo}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="EaseVerse logo"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  logoHeader: {
    width: '100%',
    paddingHorizontal: 0,
    marginBottom: 8,
    justifyContent: 'center',
    alignItems: 'center',
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
