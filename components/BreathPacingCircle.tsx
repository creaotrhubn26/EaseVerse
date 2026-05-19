import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Colors from '@/constants/colors';

type Phase = 'inhale' | 'hold' | 'exhale' | 'rest';

type Props = {
  inhaleSec?: number;
  holdSec?: number;
  exhaleSec?: number;
  restSec?: number;
  size?: number;
  active?: boolean;
};

export function BreathPacingCircle({
  inhaleSec = 4,
  holdSec = 1,
  exhaleSec = 4,
  restSec = 1,
  size = 220,
  active = true,
}: Props) {
  const scale = useRef(new Animated.Value(0.45)).current;
  const [phase, setPhase] = useState<Phase>('inhale');

  useEffect(() => {
    if (!active) {
      scale.stopAnimation();
      return;
    }
    let cancelled = false;

    const runCycle = () => {
      if (cancelled) return;
      setPhase('inhale');
      Animated.timing(scale, {
        toValue: 1,
        duration: inhaleSec * 1000,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        if (cancelled) return;
        setPhase('hold');
        Animated.timing(scale, {
          toValue: 1,
          duration: holdSec * 1000,
          useNativeDriver: true,
        }).start(() => {
          if (cancelled) return;
          setPhase('exhale');
          Animated.timing(scale, {
            toValue: 0.45,
            duration: exhaleSec * 1000,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }).start(() => {
            if (cancelled) return;
            setPhase('rest');
            Animated.timing(scale, {
              toValue: 0.45,
              duration: restSec * 1000,
              useNativeDriver: true,
            }).start(() => {
              if (!cancelled) runCycle();
            });
          });
        });
      });
    };

    runCycle();

    return () => {
      cancelled = true;
      scale.stopAnimation();
    };
  }, [active, inhaleSec, holdSec, exhaleSec, restSec, scale]);

  const label =
    phase === 'inhale' ? 'Inhale' : phase === 'hold' ? 'Hold' : phase === 'exhale' ? 'Exhale' : 'Rest';

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            transform: [{ scale }],
          },
        ]}
      />
      <View style={styles.labelWrap} pointerEvents="none">
        <Text style={styles.label} accessibilityLiveRegion="polite">
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    position: 'absolute',
    backgroundColor: Colors.accentSubtle,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
  },
  labelWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: Colors.textPrimary,
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    letterSpacing: 0.6,
  },
});
