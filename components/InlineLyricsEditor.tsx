import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { WordsmithModal } from './WordsmithModal';
import { SpeechToLyricsModal } from './SpeechToLyricsModal';

type Props = {
  visible: boolean;
  initialLyrics: string;
  title?: string;
  onCancel: () => void;
  onSave: (lyrics: string) => void;
};

export function InlineLyricsEditor({ visible, initialLyrics, title, onCancel, onSave }: Props) {
  const [draft, setDraft] = useState(initialLyrics);
  const [showWordsmith, setShowWordsmith] = useState(false);
  const [showSpeech, setShowSpeech] = useState(false);

  useEffect(() => {
    if (visible) {
      setDraft(initialLyrics);
    }
  }, [visible, initialLyrics]);

  function lastWordOfDraft(): string {
    const trimmed = draft.trim();
    if (!trimmed) return '';
    const lastLine = trimmed.split('\n').pop() ?? '';
    const tokens = lastLine.match(/[A-Za-zÀ-ÖØ-öø-ÿ']+/g);
    return tokens && tokens.length > 0 ? tokens[tokens.length - 1] : '';
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {title ? `Edit • ${title}` : 'Edit lyrics'}
          </Text>
          <Pressable
            onPress={() => setShowSpeech(true)}
            hitSlop={8}
            style={styles.toolButton}
            accessibilityRole="button"
            accessibilityLabel="Speak to add lyrics"
          >
            <Ionicons name="mic" size={16} color={Colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={() => setShowWordsmith(true)}
            hitSlop={8}
            style={styles.toolButton}
            accessibilityRole="button"
            accessibilityLabel="Find rhymes or synonyms"
          >
            <Ionicons name="search" size={16} color={Colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={() => onSave(draft)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Save lyrics"
          >
            <LinearGradient
              colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd] as const}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.saveButton}
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text style={styles.saveText}>Save</Text>
            </LinearGradient>
          </Pressable>
        </View>

        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          textAlignVertical="top"
          autoFocus
          placeholder="Write or paste your lyrics here…"
          placeholderTextColor={Colors.textTertiary}
          style={styles.textarea}
          accessibilityLabel="Lyrics editor"
        />

        <WordsmithModal
          visible={showWordsmith}
          initialWord={lastWordOfDraft()}
          onClose={() => setShowWordsmith(false)}
          onPick={(word) => {
            const trimmed = draft.replace(/[ \t]+$/, '');
            const sep = trimmed.length === 0 || trimmed.endsWith('\n') ? '' : ' ';
            setDraft(`${trimmed}${sep}${word}`);
            setShowWordsmith(false);
          }}
        />

        <SpeechToLyricsModal
          visible={showSpeech}
          onCancel={() => setShowSpeech(false)}
          onAdd={(text) => {
            if (text) {
              const trimmed = draft.replace(/[ \t]+$/, '');
              const sep = trimmed.length === 0 || trimmed.endsWith('\n') ? '' : '\n';
              setDraft(`${trimmed}${sep}${text}`);
            }
            setShowSpeech(false);
          }}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
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
  toolButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    marginRight: 8,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  saveText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  textarea: {
    flex: 1,
    padding: 18,
    color: Colors.textPrimary,
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    lineHeight: 24,
  },
});
