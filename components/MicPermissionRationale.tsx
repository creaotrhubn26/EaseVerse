import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

type Props = {
  visible: boolean;
  onAllow: () => void;
  onCancel: () => void;
};

export function MicPermissionRationale({ visible, onAllow, onCancel }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.iconCircle}>
            <Ionicons name="mic" size={32} color="#fff" />
          </View>
          <Text style={styles.title}>We need your microphone</Text>
          <Text style={styles.body}>
            EaseVerse records vocals locally on your device for live lyric tracking and pronunciation coaching.
            Recordings are only saved if you choose to keep them.
          </Text>
          <View style={styles.bulletList}>
            <Bullet icon="musical-notes-outline">Live highlighting of lyric words as you sing</Bullet>
            <Bullet icon="sparkles-outline">Coach tips for pronunciation, rhythm and clarity</Bullet>
            <Bullet icon="lock-closed-outline">Audio never leaves your device without your choice</Bullet>
          </View>
          <Pressable onPress={onAllow} accessibilityRole="button">
            <LinearGradient
              colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd] as const}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.allowButton}
            >
              <Text style={styles.allowText}>Allow microphone</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={onCancel} accessibilityRole="button" style={styles.cancelButton}>
            <Text style={styles.cancelText}>Not now</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Bullet({
  icon,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  children: React.ReactNode;
}) {
  return (
    <View style={styles.bulletRow}>
      <Ionicons name={icon} size={18} color={Colors.gradientMid} style={styles.bulletIcon} />
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#16181F',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.gradientStart,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    color: Colors.textSecondary,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
  },
  bulletList: {
    alignSelf: 'stretch',
    marginBottom: 20,
    gap: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletIcon: {
    marginTop: 1,
  },
  bulletText: {
    flex: 1,
    color: Colors.textPrimary,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 18,
  },
  allowButton: {
    alignSelf: 'stretch',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  allowText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  cancelText: {
    color: Colors.textSecondary,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
});
