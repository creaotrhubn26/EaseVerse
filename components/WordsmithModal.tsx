import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import {
  fetchMeansLike,
  fetchNearRhymes,
  fetchRhymes,
  fetchSynonyms,
} from '@/lib/wordsmith';

type Tab = 'rhymes' | 'synonyms';

type Props = {
  visible: boolean;
  initialWord?: string;
  onClose: () => void;
  onPick: (word: string) => void;
};

export function WordsmithModal({ visible, initialWord, onClose, onPick }: Props) {
  const [word, setWord] = useState(initialWord ?? '');
  const [tab, setTab] = useState<Tab>('rhymes');
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setWord(initialWord ?? '');
      setTab('rhymes');
      setResults([]);
    }
  }, [visible, initialWord]);

  useEffect(() => {
    if (!visible) return;
    const trimmed = word.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const fetcher = async () => {
      const primary =
        tab === 'rhymes' ? await fetchRhymes(trimmed) : await fetchSynonyms(trimmed);
      let combined = primary;
      if (combined.length < 4) {
        const secondary =
          tab === 'rhymes' ? await fetchNearRhymes(trimmed) : await fetchMeansLike(trimmed);
        combined = Array.from(new Set([...combined, ...secondary]));
      }
      if (!cancelled) {
        setResults(combined.slice(0, 16));
        setLoading(false);
      }
    };
    const handle = setTimeout(() => {
      void fetcher();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
      setLoading(false);
    };
  }, [visible, word, tab]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.touchOutside} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Word lookup</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.tabsRow}>
            <TabButton label="Rhymes" active={tab === 'rhymes'} onPress={() => setTab('rhymes')} />
            <TabButton label="Synonyms" active={tab === 'synonyms'} onPress={() => setTab('synonyms')} />
          </View>

          <TextInput
            value={word}
            onChangeText={setWord}
            placeholder={tab === 'rhymes' ? 'Type a word to find rhymes' : 'Type a word to find synonyms'}
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
            style={styles.input}
            accessibilityLabel="Lookup word"
          />

          <View style={styles.resultsArea}>
            {loading ? (
              <ActivityIndicator color={Colors.textTertiary} style={{ marginTop: 24 }} />
            ) : results.length === 0 && word.trim().length > 0 ? (
              <Text style={styles.emptyText}>No results — try another word.</Text>
            ) : (
              <ScrollView contentContainerStyle={styles.chipWrap} keyboardShouldPersistTaps="handled">
                {results.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => onPick(item)}
                    style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Insert ${item}`}
                  >
                    <Text style={styles.chipText}>{item}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  touchOutside: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#16181F',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    maxHeight: '70%',
    gap: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: Colors.textPrimary,
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: Colors.gradientStart,
  },
  tabText: {
    color: Colors.textSecondary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  tabTextActive: {
    color: '#fff',
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
  },
  resultsArea: {
    minHeight: 80,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  chipPressed: {
    opacity: 0.6,
  },
  chipText: {
    color: Colors.textPrimary,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  emptyText: {
    color: Colors.textTertiary,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    marginTop: 24,
    textAlign: 'center',
  },
});
