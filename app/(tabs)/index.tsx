import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, Pressable, Platform, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { getGenreProfile, getGenreCoachHints, getWordTipForGenre, getGenreFixReasons } from '@/constants/genres';
import RecordButton from '@/components/RecordButton';
import CoachPill from '@/components/CoachPill';
import QualityPill from '@/components/QualityPill';
import LiveLyricsCanvas from '@/components/LiveLyricsCanvas';
import VUMeter from '@/components/VUMeter';
import SongPickerModal from '@/components/SongPickerModal';
import { useApp } from '@/lib/AppContext';
import { buildDemoLyricLines } from '@/lib/demo-data';
import { generateId } from '@/lib/storage';
import { useRecording } from '@/lib/useRecording';
import type { LyricLine, SignalQuality, Session } from '@/lib/types';

export default function SingScreen() {
  const insets = useSafeAreaInsets();
  const { activeSong, songs, setActiveSong, addSession } = useApp();
  const recording = useRecording();
  const [activeLineIndex, setActiveLineIndex] = useState(0);
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const [quality, setQuality] = useState<SignalQuality>('good');
  const [coachHint, setCoachHint] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('Ready to sing');
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [showSongPicker, setShowSongPicker] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const coachTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wordAudioLevelsRef = useRef<Map<string, number>>(new Map());

  const isRecording = recording.isRecording;
  const isPaused = recording.isPaused;
  const duration = recording.duration;

  const lyricsText = activeSong?.lyrics || '';
  const lyricsLines = lyricsText.split('\n').filter(l => l.trim());
  const genre = activeSong?.genre || 'pop';
  const genreProfile = useMemo(() => getGenreProfile(genre), [genre]);
  const genreHints = useMemo(() => getGenreCoachHints(genre), [genre]);

  useEffect(() => {
    if (lyricsText) {
      setLines(buildDemoLyricLines(lyricsText, activeLineIndex, activeWordIndex, genre, recording.audioLevel, wordAudioLevelsRef.current));
    }
  }, [lyricsText, activeLineIndex, activeWordIndex, genre, recording.audioLevel]);

  useEffect(() => {
    if (isRecording && !isPaused) {
      intervalRef.current = setInterval(() => {
        const currentLevel = recording.audioLevel;
        setActiveWordIndex(prev => {
          const currentLine = lyricsLines[activeLineIndex] || '';
          const wordCount = currentLine.split(' ').filter(w => w.trim()).length;
          wordAudioLevelsRef.current.set(`${activeLineIndex}-${prev}`, currentLevel);
          if (prev + 1 >= wordCount) {
            setActiveLineIndex(li => {
              if (li + 1 >= lyricsLines.length) {
                handleStop();
                return li;
              }
              return li + 1;
            });
            return 0;
          }
          return prev + 1;
        });
      }, 800);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRecording, isPaused, activeLineIndex, lyricsLines.length, recording.audioLevel]);

  useEffect(() => {
    if (isRecording && !isPaused) {
      coachTimerRef.current = setInterval(() => {
        const currentLine = lyricsLines[activeLineIndex] || '';
        const words = currentLine.split(' ').filter(w => w.trim());
        const currentWord = words[activeWordIndex] || '';
        const wordTip = currentWord ? getWordTipForGenre(currentWord, genre) : null;
        const hint = wordTip || genreHints[Math.floor(Math.random() * genreHints.length)];
        setCoachHint(hint);
        setTimeout(() => setCoachHint(null), 2500);
      }, 4000);
    } else {
      if (coachTimerRef.current) clearInterval(coachTimerRef.current);
      setCoachHint(null);
    }
    return () => { if (coachTimerRef.current) clearInterval(coachTimerRef.current); };
  }, [isRecording, isPaused, genreHints, genre, activeLineIndex, activeWordIndex]);

  useEffect(() => {
    if (isRecording && !isPaused) {
      setStatusText('Listening...');
    } else if (isPaused) {
      setStatusText('Paused');
    } else {
      setStatusText('Ready to sing');
    }
  }, [isRecording, isPaused]);

  useEffect(() => {
    if (isRecording && !isPaused) {
      const level = recording.audioLevel;
      if (level > 0.4) {
        setQuality('good');
      } else if (level > 0.15) {
        setQuality('ok');
      } else {
        setQuality('poor');
      }
    }
  }, [isRecording, isPaused, recording.audioLevel]);

  const handleStop = useCallback(async () => {
    const result = await recording.stop();
    const elapsed = result.durationSeconds;
    if (elapsed > 3) {
      const levels = wordAudioLevelsRef.current;
      const allLevels = Array.from(levels.values());
      const totalWords = allLevels.length || 1;

      const confirmedCount = allLevels.filter(l => l > 0.35).length;
      const unclearCount = allLevels.filter(l => l > 0.12 && l <= 0.35).length;
      const missedCount = allLevels.filter(l => l <= 0.12).length;

      const textAccuracy = Math.round((confirmedCount / totalWords) * 100);
      const pronunciationClarity = Math.round(((confirmedCount + unclearCount * 0.5) / totalWords) * 100);
      const avgLevel = allLevels.reduce((sum, l) => sum + l, 0) / totalWords;
      const timingConsistency = avgLevel > 0.35 ? 'high' : avgLevel > 0.2 ? 'medium' : 'low';

      const allLines = lyricsText.split('\n').filter(l => l.trim());
      const fixWords: { word: string; reason: string }[] = [];
      levels.forEach((level, key) => {
        if (level <= 0.35) {
          const [li, wi] = key.split('-').map(Number);
          const lineWords = (allLines[li] || '').split(' ').filter(w => w.trim());
          const w = lineWords[wi];
          if (w && !fixWords.find(f => f.word === w)) {
            const genreTip = getWordTipForGenre(w, genre);
            fixWords.push({
              word: w,
              reason: genreTip || (level <= 0.12 ? 'Not heard clearly' : 'Needs more projection'),
            });
          }
        }
      });

      const topToFix = fixWords.slice(0, 5);
      if (topToFix.length === 0) {
        const genreFixes = getGenreFixReasons(genre);
        topToFix.push(...genreFixes.slice(0, 3));
      }

      const session: Session = {
        id: generateId(),
        songId: activeSong?.id,
        genre,
        title: `${activeSong?.title || 'Recording'} - Take`,
        duration: elapsed,
        date: Date.now(),
        tags: ['practice', genreProfile.label.toLowerCase()],
        favorite: false,
        insights: {
          textAccuracy: Math.max(10, Math.min(100, textAccuracy)),
          pronunciationClarity: Math.max(10, Math.min(100, pronunciationClarity)),
          timingConsistency,
          topToFix,
        },
        lyrics: lyricsText,
      };
      addSession(session);
      router.push({ pathname: '/session/[id]', params: { id: session.id, fromRecording: '1' } });
    }
    wordAudioLevelsRef.current = new Map();
    setActiveLineIndex(0);
    setActiveWordIndex(0);
  }, [activeSong, lyricsText, addSession, genre, genreProfile, recording]);

  const handleRecordPress = async () => {
    if (!isRecording) {
      setActiveLineIndex(0);
      setActiveWordIndex(0);
      wordAudioLevelsRef.current = new Map();
      await recording.start();
    } else {
      await recording.togglePause();
    }
  };

  const handleMarker = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.songSelector}
          onPress={() => {
            Haptics.selectionAsync();
            setShowSongPicker(true);
          }}
        >
          <Text style={styles.songTitle} numberOfLines={1}>
            {activeSong?.title || 'No Song'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={Colors.textTertiary} />
        </Pressable>

        <View style={styles.topRight}>
          {activeSong && (
            <View style={[styles.genreBadge, { backgroundColor: genreProfile.accentColor, borderColor: genreProfile.color }]}>
              <Ionicons name={genreProfile.icon} size={12} color={genreProfile.color} />
              <Text style={[styles.genreBadgeText, { color: genreProfile.color }]}>{genreProfile.label}</Text>
            </View>
          )}
          <QualityPill quality={quality} />
        </View>
      </View>

      {activeSong && !isRecording && (
        <View style={styles.preRecordRow}>
          <View style={styles.genreTipBar}>
            <Ionicons name="bulb-outline" size={14} color={genreProfile.color} />
            <Text style={styles.genreTipText} numberOfLines={1}>
              {genreProfile.vocalStyle}
            </Text>
          </View>
          <Pressable
            style={styles.warmUpBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push('/warmup');
            }}
          >
            <Image source={require('@/assets/images/warmup-icon.png')} style={styles.warmUpIcon} />
            <Text style={styles.warmUpBtnText}>Warm Up</Text>
          </Pressable>
          <Pressable
            style={styles.mindfulBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push('/mindfulness');
            }}
          >
            <Image source={require('@/assets/images/mindfulness-icon.png')} style={styles.mindfulIcon} />
          </Pressable>
        </View>
      )}

      <View style={[styles.lyricsArea, { pointerEvents: 'box-none' as const }]}>
        <LiveLyricsCanvas lines={lines} activeLineIndex={activeLineIndex} />
      </View>

      <View style={styles.coachArea}>
        <CoachPill hint={coachHint} visible={!!coachHint} />
      </View>

      <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, webBottomInset) + 90 }]}>
        <VUMeter isActive={isRecording && !isPaused} audioLevel={recording.audioLevel} />

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, {
            backgroundColor: isRecording && !isPaused
              ? Colors.successUnderline
              : isPaused
              ? Colors.warningUnderline
              : Colors.textTertiary,
          }]} />
          <Text style={styles.statusText}>{statusText}</Text>
          {isRecording && (
            <Text style={styles.timerText}>{formatTime(duration)}</Text>
          )}
        </View>

        <View style={styles.transportRow}>
          <Pressable
            style={styles.transportBtn}
            onPress={handleMarker}
            disabled={!isRecording}
          >
            <Ionicons
              name="flag"
              size={24}
              color={isRecording ? Colors.textSecondary : Colors.textTertiary}
            />
          </Pressable>

          <RecordButton
            isRecording={isRecording}
            isPaused={isPaused}
            onPress={handleRecordPress}
            size={80}
          />

          {isRecording ? (
            <Pressable
              style={styles.transportBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                handleStop();
              }}
              testID="stop-button"
            >
              <Ionicons name="stop-circle" size={28} color={Colors.dangerUnderline} />
            </Pressable>
          ) : (
            <Pressable style={styles.transportBtn} onPress={() => {}}>
              <MaterialCommunityIcons
                name="metronome"
                size={24}
                color={Colors.textTertiary}
              />
            </Pressable>
          )}
        </View>
      </View>

      {!activeSong && (
        <View style={styles.emptyOverlay}>
          <View style={styles.emptyCard}>
            <Ionicons name="musical-notes" size={48} color={Colors.textTertiary} />
            <Text style={styles.emptyTitle}>No lyrics loaded</Text>
            <Pressable
              style={styles.emptyBtn}
              onPress={() => router.push('/(tabs)/lyrics')}
            >
              <LinearGradient
                colors={[Colors.gradientStart, Colors.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.emptyBtnGradient}
              >
                <Text style={styles.emptyBtnText}>Add Lyrics</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      )}

      <SongPickerModal
        visible={showSongPicker}
        songs={songs}
        activeSongId={activeSong?.id}
        onSelect={(song) => setActiveSong(song)}
        onClose={() => setShowSongPicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    zIndex: 10,
  },
  songSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 12,
  },
  songTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    maxWidth: '80%',
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  genreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  genreBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  preRecordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
  },
  genreTipBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.surfaceGlass,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  warmUpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.accentSubtle,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
  },
  warmUpIcon: {
    width: 20,
    height: 20,
  },
  warmUpBtnText: {
    color: Colors.gradientStart,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  mindfulBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 10,
    overflow: 'hidden',
  },
  mindfulIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  genreTipText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  lyricsArea: {
    flex: 1,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  coachArea: {
    minHeight: 40,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  controls: {
    paddingHorizontal: 20,
    gap: 10,
    zIndex: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    color: Colors.textTertiary,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  timerText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    marginLeft: 4,
  },
  transportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  transportBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14,15,20,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyCard: {
    alignItems: 'center',
    gap: 16,
  },
  emptyTitle: {
    color: Colors.textSecondary,
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
  },
  emptyBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  emptyBtnGradient: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  emptyBtnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
});
