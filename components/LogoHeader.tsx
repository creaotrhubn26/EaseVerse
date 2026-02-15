import React from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

type LogoHeaderProps = {
  style?: StyleProp<ViewStyle>;
};

export default function LogoHeader(props: LogoHeaderProps) {
  return (
    <View style={[styles.logoHeader, props.style]}>
      <Image
        source={require('@/assets/images/easeverse_logo.png')}
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
    aspectRatio: 3.2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
});

