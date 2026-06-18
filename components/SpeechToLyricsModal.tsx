import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import Colors from '@/constants/colors';

type Props = {
  visible: boolean;
  language?: string;
  onCancel: () => void;
  onAdd: (text: string) => void;
};

export function SpeechToLyricsModal({ visible, language, onCancel, onAdd }: Props) {
  const [partial, setPartial] = useState('');
  const [committed, setCommitted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  // expo-speech-recognition works on native (iOS SFSpeechRecognizer) AND web,
  // so the same flow replaces the old web-only SpeechRecognition path.
  useSpeechRecognitionEvent('start', () => {
    setListening(true);
    setError(null);
  });
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results?.[0]?.transcript?.trim() ?? '';
    if (!transcript) return;
    if (event.isFinal) {
      setCommitted((prev) => `${prev}${prev ? '\n' : ''}${transcript}`);
      setPartial('');
    } else {
      setPartial(transcript);
    }
  });
  useSpeechRecognitionEvent('error', (event) => {
    // "no-speech"/"aborted" are routine when the user pauses — don't surface those.
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    setError(event.message || 'Recognition error. Try again.');
    setListening(false);
  });

  useEffect(() => {
    if (!visible) {
      setPartial('');
      setCommitted('');
      setError(null);
      setListening(false);
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // Ignore.
      }
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (cancelled) return;
        if (!perm.granted) {
          setError('Microphone & speech-recognition access is needed. Enable them in Settings and try again.');
          return;
        }
        ExpoSpeechRecognitionModule.start({
          lang: language || 'en-US',
          interimResults: true,
          continuous: true,
        });
      } catch (err) {
        if (!cancelled) {
          console.warn('Speech start failed:', err);
          setError('Could not start speech recognition. Try again.');
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // Ignore.
      }
    };
  }, [visible, language]);

  const fullText = committed + (partial ? `${committed ? ' ' : ''}${partial}` : '');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onCancel}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Speak to add lyrics</Text>
          <Pressable
            onPress={() => onAdd(committed.trim())}
            disabled={committed.trim().length === 0}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Add captured text to lyrics"
          >
            <LinearGradient
              colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd] as const}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.addButton, committed.trim().length === 0 && styles.addButtonDisabled]}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addText}>Add</Text>
            </LinearGradient>
          </Pressable>
        </View>

        <View style={styles.body}>
          <View style={styles.micRow}>
            <View style={styles.micDot} />
            <Text style={styles.micLabel}>{error ? 'Idle' : listening ? 'Listening…' : 'Starting…'}</Text>
          </View>

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <ScrollView contentContainerStyle={styles.transcriptArea}>
              {fullText.length === 0 ? (
                <Text style={styles.placeholderText}>
                  Speak a line. Final phrases will appear in white; live preview in grey.
                </Text>
              ) : (
                <Text style={styles.committedText}>
                  {committed}
                  {partial ? <Text style={styles.partialText}> {partial}</Text> : null}
                </Text>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderGlass,
  },
  cancelText: {
    color: Colors.textSecondary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  title: {
    flex: 1,
    marginHorizontal: 12,
    textAlign: 'center',
    color: Colors.textPrimary,
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  body: {
    flex: 1,
    padding: 18,
    gap: 12,
  },
  micRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  micDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dangerUnderline,
  },
  micLabel: {
    color: Colors.textSecondary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  transcriptArea: {
    paddingVertical: 12,
  },
  placeholderText: {
    color: Colors.textTertiary,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    fontStyle: 'italic',
  },
  committedText: {
    color: Colors.textPrimary,
    fontFamily: 'Inter_500Medium',
    fontSize: 17,
    lineHeight: 26,
  },
  partialText: {
    color: Colors.textTertiary,
    fontStyle: 'italic',
  },
  errorText: {
    color: Colors.dangerUnderline,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
});
