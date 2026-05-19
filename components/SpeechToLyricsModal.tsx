import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

type Props = {
  visible: boolean;
  language?: string;
  onCancel: () => void;
  onAdd: (text: string) => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): { new (): SpeechRecognitionLike } | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    SpeechRecognition?: { new (): SpeechRecognitionLike };
    webkitSpeechRecognition?: { new (): SpeechRecognitionLike };
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function SpeechToLyricsModal({ visible, language, onCancel, onAdd }: Props) {
  const [partial, setPartial] = useState('');
  const [committed, setCommitted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (!visible) {
      setPartial('');
      setCommitted('');
      setError(null);
      try {
        recognitionRef.current?.abort();
      } catch {
        // Ignore.
      }
      recognitionRef.current = null;
      return;
    }

    if (Platform.OS !== 'web') {
      setError('Speech-to-lyrics is currently web-only.');
      return;
    }

    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError(
        'Your browser does not support live speech recognition. Try the latest Chrome or Safari.',
      );
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language || 'en-US';

    recognition.onresult = (event) => {
      let interim = '';
      const finals: string[] = [];
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const alt = result[0];
        if (!alt) continue;
        if (result.isFinal) {
          finals.push(alt.transcript.trim());
        } else {
          interim += alt.transcript;
        }
      }
      if (finals.length > 0) {
        setCommitted((prev) => `${prev}${prev ? '\n' : ''}${finals.join(' ')}`);
      }
      setPartial(interim.trim());
    };
    recognition.onerror = () => {
      setError('Recognition error. Try again.');
    };
    recognition.onend = () => {
      // Restart while modal is open so dictation continues.
      try {
        if (recognitionRef.current === recognition) {
          recognition.start();
        }
      } catch {
        // Ignore — typically thrown when starting too quickly.
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      console.warn('Speech start failed:', err);
    }

    return () => {
      recognitionRef.current = null;
      try {
        recognition.abort();
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
            <Text style={styles.micLabel}>{error ? 'Idle' : 'Listening…'}</Text>
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
