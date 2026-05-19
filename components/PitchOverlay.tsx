import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import type { PitchReading } from '@/lib/usePitchDetection';
import type { VibratoReading } from '@/lib/useVibratoDetection';

type Props = {
  reading: PitchReading;
  vibrato?: VibratoReading;
};

export function PitchOverlay({ reading, vibrato }: Props) {
  const hasPitch = reading.note !== null && reading.hz !== null;
  const cents = reading.cents;
  const absCents = Math.abs(cents);
  const accuracyColor =
    absCents <= 8
      ? Colors.successUnderline
      : absCents <= 20
      ? Colors.warningUnderline
      : Colors.dangerUnderline;
  const indicatorPos = Math.max(-50, Math.min(50, cents)) / 50; // -1..1

  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <View style={styles.row}>
        <Text style={[styles.note, !hasPitch && styles.noteDim]}>
          {hasPitch ? reading.note : '—'}
        </Text>
        <Text style={[styles.cents, { color: accuracyColor }]}>
          {hasPitch ? `${cents > 0 ? '+' : ''}${cents}¢` : ''}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={styles.tickCenter} />
        {hasPitch ? (
          <View
            style={[
              styles.indicator,
              {
                left: `${50 + indicatorPos * 48}%`,
                backgroundColor: accuracyColor,
              },
            ]}
          />
        ) : null}
      </View>
      {vibrato?.active ? (
        <View style={styles.vibratoRow}>
          <Ionicons name="pulse" size={12} color={Colors.gradientMid} />
          <Text style={styles.vibratoText}>
            Vibrato {vibrato.intensity}
            {vibrato.rateHz ? ` · ${vibrato.rateHz.toFixed(1)} Hz` : ''}
            {vibrato.depthCents ? ` · ±${Math.round(vibrato.depthCents)}¢` : ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 6,
    minWidth: 130,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  note: {
    color: Colors.textPrimary,
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  noteDim: {
    color: Colors.textTertiary,
  },
  cents: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
  },
  tickCenter: {
    position: 'absolute',
    left: '50%',
    top: -2,
    width: 2,
    height: 10,
    marginLeft: -1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  indicator: {
    position: 'absolute',
    top: -3,
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
  },
  vibratoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  vibratoText: {
    color: Colors.gradientMid,
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
});
