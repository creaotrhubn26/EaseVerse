import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

/** Only hides the preview on this screen; the original feedback is never changed. */
export function DismissibleFeedbackPreview({ children, hidden, onDismiss, onUndo }: {
  children: React.ReactNode;
  hidden: boolean;
  onDismiss: () => void;
  onUndo: () => void;
}) {
  const offset = useRef(new Animated.Value(0)).current;
  const dismissRef = useRef(onDismiss);
  useEffect(() => { dismissRef.current = onDismiss; }, [onDismiss]);
  useEffect(() => { if (!hidden) offset.setValue(0); }, [hidden, offset]);
  const pan = useMemo(() => PanResponder.create({
    // Capture only deliberate horizontal motion; vertical lyric scrolling works.
    onMoveShouldSetPanResponderCapture: (_, gesture) => gesture.dx < -12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
    onPanResponderMove: (_, gesture) => offset.setValue(Math.min(0, gesture.dx)),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx < -72 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5) dismissRef.current();
      else Animated.timing(offset, { toValue: 0, duration: 120, useNativeDriver: Platform.OS !== 'web' }).start();
    },
    onPanResponderTerminate: () => offset.setValue(0),
  }), [offset]);
  if (hidden) return <View style={styles.undoRow}>
    <Text accessibilityLiveRegion="polite" aria-live="polite" style={styles.hint}>Feedback is still in the Feedback tab.</Text>
    <Pressable onPress={onUndo} accessibilityRole="button" accessibilityLabel="Undo hiding feedback" style={styles.action}>
      <Text style={styles.actionLabel}>Undo</Text>
    </Pressable>
  </View>;
  return <View style={styles.swipeArea}>
    <View style={styles.swipeHint} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <Ionicons name="eye-off-outline" size={20} color={Colors.textPrimary} />
      <Text style={styles.hint}>Hide</Text>
    </View>
    <Animated.View {...pan.panHandlers} style={[styles.card, { transform: [{ translateX: offset }] }]}>
      <View style={styles.content}>{children}</View>
      <Pressable onPress={onDismiss} style={styles.action} accessibilityRole="button" accessibilityLabel="Hide feedback preview" accessibilityHint="You can still read it in the Feedback tab.">
        <Ionicons name="close" size={20} color={Colors.textSecondary} />
      </Pressable>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  swipeArea: { overflow: 'hidden', borderRadius: 16 },
  card: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.surface, borderRadius: 16 },
  content: { flex: 1, minWidth: 0 },
  action: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  actionLabel: { color: Colors.gradientMid, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  hint: { color: Colors.textSecondary, fontSize: 12, flexShrink: 1 },
  undoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 8 },
  swipeHint: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 72, alignItems: 'center', justifyContent: 'center', gap: 6 },
});
