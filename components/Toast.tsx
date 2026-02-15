import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AudioModule, useAudioPlayer } from 'expo-audio';
import Colors from '@/constants/colors';
import type { ComponentProps } from 'react';

type ToastVariant = 'success' | 'error' | 'info';
type ToastSound = 'none' | 'lyricsUpdated';

type ToastProps = {
  visible: boolean;
  message: string;
  variant?: ToastVariant;
  sound?: ToastSound;
  onHide: () => void;
  duration?: number;
};

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const variantConfig: Record<ToastVariant, { icon: IoniconName; color: string }> = {
  success: { icon: 'checkmark-circle', color: '#4ADE80' },
  error: { icon: 'alert-circle', color: '#F87171' },
  info: { icon: 'information-circle', color: Colors.gradientStart },
};

export default function Toast({
  visible,
  message,
  variant = 'success',
  sound = 'none',
  onHide,
  duration = 2200,
}: ToastProps) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;
  const didPlaySoundRef = useRef(false);
  const sfxPlayer = useAudioPlayer(
    sound === 'lyricsUpdated' ? require('@/assets/sounds/lyrics-updated.wav') : null
  );

  useEffect(() => {
    if (!visible) {
      didPlaySoundRef.current = false;
      return;
    }

    AccessibilityInfo.announceForAccessibility(message);

    if (!didPlaySoundRef.current && sound !== 'none') {
      didPlaySoundRef.current = true;
      try {
        void AudioModule.setAudioModeAsync({ playsInSilentMode: true });
      } catch {
        // Ignore audio-mode errors.
      }
      try {
        sfxPlayer.volume = 0.45;
        void sfxPlayer.seekTo(0).catch(() => undefined);
        setTimeout(() => {
          try {
            sfxPlayer.play();
          } catch {
            // Ignore sound effect failures (autoplay restrictions, etc.)
          }
        }, 0);
      } catch {
        // Ignore sound effect failures.
      }
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -20,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onHide();
      });
    }, duration);

    return () => clearTimeout(timer);
  }, [visible, duration, sound, variant, message, opacity, sfxPlayer, translateY, onHide]);

  if (!visible) return null;

  const config = variantConfig[variant];

  return (
    <Animated.View
      style={[
        styles.container,
        { top: insets.top + 8, opacity, transform: [{ translateY }] },
      ]}
      pointerEvents="none"
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={message}
    >
      <View style={styles.toast}>
        <Ionicons name={config.icon} size={20} color={config.color} />
        <Text style={styles.message}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  message: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
});
