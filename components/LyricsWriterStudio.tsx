import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import type { Session } from '@/lib/types';
import type {
  LyricsCaptureItem,
  LyricsLineComment,
  LyricsVersionRecord,
} from '@/lib/storage';
import {
  buildMeterAnalysis,
  buildRhymeMap,
  buildSectionGoalHints,
  buildSingBackHotspots,
  buildLyricsExportText,
  generateHookVariants,
  lintLyricsLines,
  summarizeVersionDiff,
} from '@/lib/lyrics-writer-tools';

type ExportMode = 'copy-clean' | 'copy-rehearsal' | 'download-clean' | 'print';

type LyricsWriterStudioProps = {
  lyrics: string;
  songTitle: string;
  genreLabel: string;
  bpm?: number;
  sessions: Session[];
  activeSongId?: string;
  versions: LyricsVersionRecord[];
  comments: LyricsLineComment[];
  captures: LyricsCaptureItem[];
  onCreateVersion: (note?: string) => void;
  onRestoreVersion: (versionId: string) => void;
  onDeleteVersion: (versionId: string) => void;
  onUpsertComment: (lineNumber: number, text: string) => void;
  onDeleteComment: (commentId: string) => void;
  onAddCapture: (text: string) => void;
  onToggleCapturePin: (captureId: string) => void;
  onDeleteCapture: (captureId: string) => void;
  onInsertText: (text: string) => void;
  onJumpToLine: (lineNumber: number) => void;
  onExport: (mode: ExportMode) => void;
};

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const deltaMs = Math.max(0, now - timestamp);
  const mins = Math.floor(deltaMs / 60000);
  if (mins < 1) {
    return 'Just now';
  }
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isHeaderLine(line: string): boolean {
  return /^\s*\[[^\]]+\]\s*$/i.test(line);
}

export default function LyricsWriterStudio({
  lyrics,
  songTitle,
  genreLabel,
  bpm,
  sessions,
  activeSongId,
  versions,
  comments,
  captures,
  onCreateVersion,
  onRestoreVersion,
  onDeleteVersion,
  onUpsertComment,
  onDeleteComment,
  onAddCapture,
  onToggleCapturePin,
  onDeleteCapture,
  onInsertText,
  onJumpToLine,
  onExport,
}: LyricsWriterStudioProps) {
  const [versionNote, setVersionNote] = useState('');
  const [captureDraft, setCaptureDraft] = useState('');
  const [favoriteVariantIds, setFavoriteVariantIds] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});

  const meterAnalysis = useMemo(() => buildMeterAnalysis(lyrics), [lyrics]);
  const rhymeMap = useMemo(() => buildRhymeMap(lyrics), [lyrics]);
  const lintIssues = useMemo(() => lintLyricsLines(lyrics), [lyrics]);
  const sectionGoals = useMemo(() => buildSectionGoalHints(lyrics), [lyrics]);
  const hookVariants = useMemo(() => generateHookVariants(lyrics, 8), [lyrics]);
  const singBackHotspots = useMemo(
    () => buildSingBackHotspots(lyrics, sessions, activeSongId),
    [activeSongId, lyrics, sessions]
  );

  const editableLines = useMemo(() => {
    return lyrics
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line, index) => ({
        lineNumber: index + 1,
        text: line.trim(),
      }))
      .filter((line) => line.text.length > 0 && !isHeaderLine(line.text))
      .slice(0, 28);
  }, [lyrics]);

  const commentsByLine = useMemo(() => {
    const map = new Map<number, LyricsLineComment[]>();
    for (const comment of comments) {
      const current = map.get(comment.lineNumber) ?? [];
      current.push(comment);
      map.set(comment.lineNumber, current);
    }
    return map;
  }, [comments]);

  useEffect(() => {
    const next: Record<number, string> = {};
    for (const line of editableLines) {
      const first = commentsByLine.get(line.lineNumber)?.[0];
      next[line.lineNumber] = first?.text ?? '';
    }
    setCommentDrafts(next);
  }, [commentsByLine, editableLines]);

  const hasLyrics = lyrics.trim().length > 0;
  const cleanExportText = useMemo(
    () =>
      buildLyricsExportText({
        title: songTitle || 'Untitled',
        lyrics,
        genre: genreLabel,
        bpm,
        includeLineNumbers: false,
        includeHeaders: true,
      }),
    [bpm, genreLabel, lyrics, songTitle]
  );
  const rehearsalExportText = useMemo(
    () =>
      buildLyricsExportText({
        title: songTitle || 'Untitled',
        lyrics,
        genre: genreLabel,
        bpm,
        includeLineNumbers: true,
        includeHeaders: true,
      }),
    [bpm, genreLabel, lyrics, songTitle]
  );

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Section Goals</Text>
        {sectionGoals.map((goal) => (
          <View key={`${goal.sectionLabel}-${goal.sectionType}`} style={styles.goalRow}>
            <Text style={styles.goalLabel}>{goal.sectionLabel}</Text>
            <Text style={styles.goalText}>{goal.goal}</Text>
            <Text style={styles.goalHint}>{goal.guidance}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Syllable + Stress Meter</Text>
        {meterAnalysis.length === 0 ? (
          <Text style={styles.emptyText}>Add lyric lines to see meter analysis.</Text>
        ) : (
          meterAnalysis.slice(0, 14).map((line) => (
            <Pressable
              key={`meter-${line.lineNumber}`}
              style={styles.metricRow}
              onPress={() => onJumpToLine(line.lineNumber)}
              accessibilityRole="button"
              accessibilityLabel={`Jump to line ${line.lineNumber}`}
              accessibilityHint="Moves cursor to this lyric line"
            >
              <View style={styles.metricTop}>
                <Text style={styles.metricLine}>L{line.lineNumber}</Text>
                <Text style={styles.metricSyllables}>{line.syllables} syl</Text>
                <Text style={styles.metricDensity}>{line.density}</Text>
              </View>
              <Text style={styles.metricText} numberOfLines={1}>
                {line.text}
              </Text>
              <Text style={styles.metricPattern}>{line.stressPattern}</Text>
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Rhyme Map</Text>
        <Text style={styles.subhead}>End Rhymes</Text>
        {rhymeMap.endRhymes.length === 0 ? (
          <Text style={styles.emptyText}>No repeated end rhymes yet.</Text>
        ) : (
          rhymeMap.endRhymes.slice(0, 8).map((group) => (
            <Text key={`end-${group.key}`} style={styles.rhymeRow}>
              {group.key}: lines {group.lineNumbers.join(', ')} ({group.words.slice(0, 3).join(', ')})
            </Text>
          ))
        )}
        <Text style={styles.subhead}>Internal Rhymes</Text>
        {rhymeMap.internalRhymes.length === 0 ? (
          <Text style={styles.emptyText}>No repeated internal rhyme families found.</Text>
        ) : (
          rhymeMap.internalRhymes.slice(0, 8).map((group) => (
            <Text key={`internal-${group.key}`} style={styles.rhymeRow}>
              {group.key}: lines {group.lineNumbers.slice(0, 5).join(', ')}
            </Text>
          ))
        )}
        <Text style={styles.subhead}>Multi Rhymes</Text>
        {rhymeMap.multis.length === 0 ? (
          <Text style={styles.emptyText}>No repeated multi-ending patterns yet.</Text>
        ) : (
          rhymeMap.multis.slice(0, 8).map((group) => (
            <Text key={`multi-${group.key}`} style={styles.rhymeRow}>
              {group.key}: lines {group.lineNumbers.join(', ')}
            </Text>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hook Lab</Text>
        {hookVariants.length === 0 ? (
          <Text style={styles.emptyText}>Add a chorus or a few lines to generate hook variants.</Text>
        ) : (
          hookVariants.map((variant) => {
            const isFavorite = Boolean(favoriteVariantIds[variant.id]);
            return (
              <View key={variant.id} style={styles.variantCard}>
                <View style={styles.variantHeader}>
                  <Text style={styles.variantLabel}>{variant.label}</Text>
                  <Pressable
                    onPress={() =>
                      setFavoriteVariantIds((current) => ({
                        ...current,
                        [variant.id]: !current[variant.id],
                      }))
                    }
                    style={styles.iconBtn}
                    accessibilityRole="button"
                    accessibilityLabel={isFavorite ? 'Unfavorite hook variant' : 'Favorite hook variant'}
                  >
                    <Ionicons
                      name={isFavorite ? 'star' : 'star-outline'}
                      size={16}
                      color={isFavorite ? Colors.warningUnderline : Colors.textTertiary}
                    />
                  </Pressable>
                </View>
                <Text style={styles.variantText}>{variant.lyrics}</Text>
                <View style={styles.rowActions}>
                  <Pressable
                    style={styles.smallBtn}
                    onPress={() => onInsertText(`${variant.lyrics}\n`)}
                    accessibilityRole="button"
                    accessibilityLabel="Insert hook variant into editor"
                  >
                    <Text style={styles.smallBtnText}>Insert At Cursor</Text>
                  </Pressable>
                  {isFavorite ? (
                    <Text style={styles.favoriteTag}>A/B favorite</Text>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Line Quality Lint</Text>
        {lintIssues.length === 0 ? (
          <Text style={styles.emptyText}>No major lint flags. Lyrics look clean.</Text>
        ) : (
          lintIssues.slice(0, 20).map((issue, index) => (
            <Pressable
              key={`${issue.rule}-${issue.lineNumber}-${index}`}
              style={styles.issueRow}
              onPress={() => onJumpToLine(issue.lineNumber)}
              accessibilityRole="button"
              accessibilityLabel={`Jump to line ${issue.lineNumber}`}
            >
              <Text style={[styles.issueSeverity, issue.severity === 'warn' && styles.issueSeverityWarn]}>
                {issue.severity.toUpperCase()}
              </Text>
              <View style={styles.issueContent}>
                <Text style={styles.issueRule}>
                  L{issue.lineNumber} · {issue.rule}
                </Text>
                <Text style={styles.issueMessage}>{issue.message}</Text>
              </View>
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Version Timeline</Text>
        <View style={styles.inputRow}>
          <TextInput
            value={versionNote}
            onChangeText={setVersionNote}
            placeholder="Snapshot note (optional)"
            placeholderTextColor={Colors.textTertiary}
            style={styles.input}
          />
          <Pressable
            style={styles.primaryBtn}
            onPress={() => {
              onCreateVersion(versionNote.trim() || undefined);
              setVersionNote('');
            }}
            accessibilityRole="button"
            accessibilityLabel="Create version snapshot"
          >
            <Text style={styles.primaryBtnText}>Snapshot</Text>
          </Pressable>
        </View>
        {versions.length === 0 ? (
          <Text style={styles.emptyText}>No snapshots yet.</Text>
        ) : (
          versions.slice(0, 16).map((version) => {
            const diff = summarizeVersionDiff(version.lyrics, lyrics);
            return (
              <View key={version.id} style={styles.versionCard}>
                <View style={styles.versionHeader}>
                  <Text style={styles.versionTitle}>
                    {version.note?.trim() || version.title || 'Untitled'}
                  </Text>
                  <Text style={styles.versionTime}>{formatRelativeTime(version.createdAt)}</Text>
                </View>
                <Text style={styles.versionMeta}>
                  +{diff.addedLines} / -{diff.removedLines} / ~{diff.changedLines}
                </Text>
                <View style={styles.rowActions}>
                  <Pressable
                    style={styles.smallBtn}
                    onPress={() => onRestoreVersion(version.id)}
                    accessibilityRole="button"
                    accessibilityLabel="Restore this snapshot"
                  >
                    <Text style={styles.smallBtnText}>Restore</Text>
                  </Pressable>
                  <Pressable
                    style={styles.smallBtnGhost}
                    onPress={() => onDeleteVersion(version.id)}
                    accessibilityRole="button"
                    accessibilityLabel="Delete this snapshot"
                  >
                    <Text style={styles.smallBtnGhostText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Comment Mode (Per Line)</Text>
        {editableLines.length === 0 ? (
          <Text style={styles.emptyText}>Add lines to annotate.</Text>
        ) : (
          editableLines.map((line) => {
            const lineComments = commentsByLine.get(line.lineNumber) ?? [];
            const draft = commentDrafts[line.lineNumber] ?? '';
            return (
              <View key={`comment-${line.lineNumber}`} style={styles.commentCard}>
                <Pressable onPress={() => onJumpToLine(line.lineNumber)} style={styles.commentLineHeader}>
                  <Text style={styles.commentLineLabel}>Line {line.lineNumber}</Text>
                  <Text style={styles.commentLineText} numberOfLines={1}>
                    {line.text}
                  </Text>
                </Pressable>
                <TextInput
                  value={draft}
                  onChangeText={(value) =>
                    setCommentDrafts((current) => ({ ...current, [line.lineNumber]: value }))
                  }
                  placeholder="Add a comment for this line..."
                  placeholderTextColor={Colors.textTertiary}
                  style={styles.commentInput}
                />
                <View style={styles.rowActions}>
                  <Pressable
                    style={styles.smallBtn}
                    onPress={() => onUpsertComment(line.lineNumber, draft)}
                    accessibilityRole="button"
                    accessibilityLabel={`Save comment for line ${line.lineNumber}`}
                  >
                    <Text style={styles.smallBtnText}>Save Comment</Text>
                  </Pressable>
                </View>
                {lineComments.map((comment) => (
                  <View key={comment.id} style={styles.commentRow}>
                    <Text style={styles.commentText}>{comment.text}</Text>
                    <Pressable
                      onPress={() => onDeleteComment(comment.id)}
                      style={styles.iconBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Delete comment"
                    >
                      <Ionicons name="trash-outline" size={14} color={Colors.textTertiary} />
                    </Pressable>
                  </View>
                ))}
              </View>
            );
          })
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sing-Back Linkage</Text>
        {singBackHotspots.length === 0 ? (
          <Text style={styles.emptyText}>Complete a singing session to surface weak lines.</Text>
        ) : (
          singBackHotspots.slice(0, 12).map((spot, index) => (
            <Pressable
              key={`${spot.kind}-${spot.lineNumber}-${spot.focusWord}-${index}`}
              style={styles.hotspotRow}
              onPress={() => onJumpToLine(spot.lineNumber)}
              accessibilityRole="button"
              accessibilityLabel={`Jump to flagged line ${spot.lineNumber}`}
            >
              <Text style={[styles.hotspotKind, spot.kind === 'timing' && styles.hotspotKindTiming]}>
                {spot.kind}
              </Text>
              <View style={styles.hotspotBody}>
                <Text style={styles.hotspotLine}>
                  L{spot.lineNumber}: {spot.lineText}
                </Text>
                <Text style={styles.hotspotReason}>
                  {spot.focusWord} - {spot.reason}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Capture Inbox</Text>
        <View style={styles.inputRow}>
          <TextInput
            value={captureDraft}
            onChangeText={setCaptureDraft}
            placeholder="Drop a stray line or idea..."
            placeholderTextColor={Colors.textTertiary}
            style={styles.input}
          />
          <Pressable
            style={styles.primaryBtn}
            onPress={() => {
              const next = captureDraft.trim();
              if (!next) {
                return;
              }
              onAddCapture(next);
              setCaptureDraft('');
            }}
            accessibilityRole="button"
            accessibilityLabel="Add capture to inbox"
          >
            <Text style={styles.primaryBtnText}>Add</Text>
          </Pressable>
        </View>
        {captures.length === 0 ? (
          <Text style={styles.emptyText}>No captured ideas yet.</Text>
        ) : (
          captures.slice(0, 30).map((capture) => (
            <View key={capture.id} style={styles.captureRow}>
              <Text style={styles.captureText}>{capture.text}</Text>
              <View style={styles.captureActions}>
                <Pressable
                  style={styles.iconBtn}
                  onPress={() => onInsertText(`${capture.text}\n`)}
                  accessibilityRole="button"
                  accessibilityLabel="Insert capture into editor"
                >
                  <Ionicons name="arrow-down-circle-outline" size={16} color={Colors.textSecondary} />
                </Pressable>
                <Pressable
                  style={styles.iconBtn}
                  onPress={() => onToggleCapturePin(capture.id)}
                  accessibilityRole="button"
                  accessibilityLabel={capture.pinned ? 'Unpin capture' : 'Pin capture'}
                >
                  <Ionicons
                    name={capture.pinned ? 'bookmark' : 'bookmark-outline'}
                    size={16}
                    color={capture.pinned ? Colors.gradientStart : Colors.textTertiary}
                  />
                </Pressable>
                <Pressable
                  style={styles.iconBtn}
                  onPress={() => onDeleteCapture(capture.id)}
                  accessibilityRole="button"
                  accessibilityLabel="Delete capture"
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.textTertiary} />
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pro Export</Text>
        <Text style={styles.exportPreview} numberOfLines={4}>
          {hasLyrics ? cleanExportText : 'Write lyrics to preview export.'}
        </Text>
        <View style={styles.exportActions}>
          <Pressable style={styles.smallBtn} onPress={() => onExport('copy-clean')}>
            <Text style={styles.smallBtnText}>Copy Clean</Text>
          </Pressable>
          <Pressable style={styles.smallBtn} onPress={() => onExport('copy-rehearsal')}>
            <Text style={styles.smallBtnText}>Copy Rehearsal</Text>
          </Pressable>
          <Pressable style={styles.smallBtn} onPress={() => onExport('download-clean')}>
            <Text style={styles.smallBtnText}>Download TXT</Text>
          </Pressable>
          <Pressable style={styles.smallBtn} onPress={() => onExport('print')}>
            <Text style={styles.smallBtnText}>Print / PDF</Text>
          </Pressable>
        </View>
        <Text style={styles.exportHint}>
          Rehearsal export includes line numbers and timestamp for practice sessions.
        </Text>
        <Text style={styles.exportHint} numberOfLines={2}>
          Preview includes {rehearsalExportText.split('\n').length} lines.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  section: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surface,
    padding: 12,
    gap: 8,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  subhead: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 2,
  },
  goalRow: {
    gap: 2,
    paddingVertical: 4,
  },
  goalLabel: {
    color: Colors.gradientStart,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  goalText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  goalHint: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  metricRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    padding: 8,
    gap: 4,
  },
  metricTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metricLine: {
    color: Colors.gradientStart,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  metricSyllables: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  metricDensity: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
  },
  metricText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  metricPattern: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  rhymeRow: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  variantCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    padding: 8,
    gap: 6,
  },
  variantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  variantLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  variantText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
  favoriteTag: {
    color: Colors.warningUnderline,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  issueRow: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    padding: 8,
  },
  issueSeverity: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    minWidth: 36,
    textAlign: 'center',
    paddingTop: 2,
  },
  issueSeverityWarn: {
    color: Colors.warningUnderline,
  },
  issueContent: {
    flex: 1,
    gap: 2,
  },
  issueRule: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  issueMessage: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  versionCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    padding: 8,
    gap: 6,
  },
  versionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  versionTitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
  },
  versionTime: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  versionMeta: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  commentCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    padding: 8,
    gap: 6,
  },
  commentLineHeader: {
    gap: 2,
  },
  commentLineLabel: {
    color: Colors.gradientStart,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  commentLineText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  commentInput: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surface,
    color: Colors.textPrimary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderGlass,
    paddingTop: 6,
  },
  commentText: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  hotspotRow: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    padding: 8,
  },
  hotspotKind: {
    color: Colors.gradientStart,
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
    width: 78,
    paddingTop: 2,
  },
  hotspotKindTiming: {
    color: Colors.warningUnderline,
  },
  hotspotBody: {
    flex: 1,
    gap: 2,
  },
  hotspotLine: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  hotspotReason: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  captureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    padding: 8,
  },
  captureText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  captureActions: {
    flexDirection: 'row',
    gap: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    color: Colors.textPrimary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  primaryBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentSubtle,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  primaryBtnText: {
    color: Colors.gradientStart,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  smallBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  smallBtnText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  smallBtnGhost: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: 'transparent',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  smallBtnGhostText: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  iconBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  exportPreview: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 17,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    padding: 8,
  },
  exportHint: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  emptyText: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
});
