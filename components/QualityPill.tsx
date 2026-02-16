import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import type { SignalQuality } from '@/lib/types';
import { scaledIconSize, useResponsiveLayout } from '@/lib/responsive';

interface QualityPillProps {
  quality: SignalQuality;
}

const qualityConfig = {
  good: { color: Colors.successUnderline, icon: 'wifi' as const, label: 'Good' },
  ok: { color: Colors.warningUnderline, icon: 'wifi' as const, label: 'OK' },
  poor: { color: Colors.dangerUnderline, icon: 'wifi-off' as const, label: 'Poor' },
};

export default function QualityPill({ quality }: QualityPillProps) {
  const responsive = useResponsiveLayout();
  const config = qualityConfig[quality];
  const iconSize = scaledIconSize(10, responsive);
  return (
    <View style={[styles.pill, { borderColor: config.color + '40' }]}>
      <Feather name={config.icon} size={iconSize} color={config.color} />
      <Text style={[styles.text, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  text: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
});
