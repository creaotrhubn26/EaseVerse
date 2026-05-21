import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { parseProducerNote } from "@/lib/parse-timestamps";

type BoothTake = {
  id: string;
  filename: string;
  uploadedAt: string;
  durationSec: number | null;
  status: string;
  audioUrl: string;
  producerNote: string | null;
  producerDecision: "keeper" | "redo" | null;
  producerMemoUrl: string | null;
  producerMemoDurationSec: number | null;
  transcript: string | null;
  aiNotes: string | null;
  pitchMeanHz: number | null;
  energyAvgDb: number | null;
};

type BoothPayload = {
  trackId: string;
  lyrics: { title: string | null; lyrics: string | null; bpm: number | null; updatedAt: string } | null;
  takes: BoothTake[];
};

export default function BoothScreen() {
  const insets = useSafeAreaInsets();
  const { trackId } = useLocalSearchParams<{ trackId: string }>();
  const [data, setData] = useState<BoothPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!trackId) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/booth?trackId=${encodeURIComponent(String(trackId))}`);
      if (!response.ok) throw new Error(`Booth fetch failed: ${response.status}`);
      const payload = (await response.json()) as BoothPayload;
      setData(payload);
      setError(null);
    } catch (err) {
      setError((err as Error).message || "Booth fetch failed");
    } finally {
      setLoading(false);
    }
  }, [trackId]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 2000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16 }]}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Leave booth view"
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerEyebrow}>Vocal booth</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {data?.lyrics?.title || trackId}
          </Text>
        </View>
        {data?.lyrics?.bpm ? <Text style={styles.bpm}>{data.lyrics.bpm} BPM</Text> : null}
      </View>

      {loading && !data ? (
        <ActivityIndicator color={Colors.textTertiary} style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}>
          <View style={styles.lyricsCard}>
            <Text style={styles.sectionLabel}>Lyrics</Text>
            <Text style={styles.lyricsText}>
              {data?.lyrics?.lyrics || "No lyrics published yet for this track."}
            </Text>
          </View>

          <Text style={[styles.sectionLabel, { marginTop: 18 }]}>Takes ({data?.takes.length ?? 0})</Text>
          {data?.takes.length === 0 ? (
            <Text style={styles.empty}>No takes uploaded yet. Producer will share as they go.</Text>
          ) : (
            data?.takes.map((t) => <TakeCard key={t.id} take={t} />)
          )}
        </ScrollView>
      )}
    </View>
  );
}

function TakeCard({ take }: { take: BoothTake }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const noteSegments = parseProducerNote(take.producerNote);

  function scrubTo(seconds: number) {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = seconds;
    void el.play().catch(() => undefined);
  }

  return (
    <View style={styles.takeRow}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.takeName} numberOfLines={1}>
          {take.filename}
        </Text>
        <Text style={styles.takeMeta}>
          {take.durationSec ? `${take.durationSec.toFixed(1)}s · ` : ""}
          {take.pitchMeanHz ? `${take.pitchMeanHz.toFixed(0)} Hz · ` : ""}
          {take.energyAvgDb !== null ? `${take.energyAvgDb} dB · ` : ""}
          {new Date(take.uploadedAt).toLocaleTimeString()}
        </Text>
        {Platform.OS === "web" && take.audioUrl ? (
          <audio
            ref={(node) => {
              audioRef.current = node;
            }}
            controls
            preload="none"
            src={take.audioUrl}
            style={{ width: "100%", height: 32, marginTop: 2 }}
          />
        ) : null}
        {take.producerMemoUrl && Platform.OS === "web" ? (
          <View style={styles.memoBlock}>
            <Ionicons name="mic" size={14} color={Colors.gradientMid} />
            <audio
              controls
              src={take.producerMemoUrl}
              style={{ flex: 1, height: 32 }}
            />
            {take.producerMemoDurationSec ? (
              <Text style={styles.memoDuration}>
                {Math.round(take.producerMemoDurationSec)}s
              </Text>
            ) : null}
          </View>
        ) : null}
        {noteSegments.length > 0 ? (
          <View style={styles.producerNoteBlock}>
            <Text style={styles.producerNoteLabel}>Producer note</Text>
            <Text style={styles.producerNoteText}>
              {noteSegments.map((seg, i) =>
                seg.kind === "text" ? (
                  <Text key={i}>{seg.text}</Text>
                ) : (
                  <Text
                    key={i}
                    onPress={() => scrubTo(seg.seconds)}
                    accessibilityRole="link"
                    accessibilityLabel={`Jump to ${seg.raw}`}
                    style={styles.timestampLink}
                  >
                    {seg.raw}
                  </Text>
                ),
              )}
            </Text>
          </View>
        ) : null}
        {take.aiNotes ? (
          <View style={styles.aiNotesBlock}>
            <Text style={styles.aiNotesLabel}>AI feedback</Text>
            <Text style={styles.takeNotes}>{take.aiNotes}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        {take.producerDecision ? (
          <Text
            style={[
              styles.decisionBadge,
              take.producerDecision === "keeper" ? styles.decisionKeeper : styles.decisionRedo,
            ]}
          >
            {take.producerDecision === "keeper" ? "Keeper" : "Re-do"}
          </Text>
        ) : null}
        <Text style={[styles.statusBadge, { color: statusColor(take.status) }]}>{take.status}</Text>
      </View>
    </View>
  );
}

function statusColor(status: string): string {
  if (status === "done") return Colors.successUnderline;
  if (status === "error") return Colors.dangerUnderline;
  return Colors.gradientMid;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  headerEyebrow: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  headerTitle: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 18, marginTop: 1 },
  bpm: { color: Colors.gradientMid, fontFamily: "Inter_700Bold", fontSize: 13 },
  scroll: { gap: 12 },
  lyricsCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 8,
  },
  sectionLabel: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  lyricsText: {
    color: Colors.textPrimary,
    fontFamily: "Inter_500Medium",
    fontSize: 17,
    lineHeight: 26,
  },
  takeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  takeName: { color: Colors.textPrimary, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  takeMeta: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 2 },
  takeNotes: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 4, lineHeight: 17 },
  statusBadge: { fontFamily: "Inter_700Bold", fontSize: 11, textTransform: "uppercase" },
  decisionBadge: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  decisionKeeper: {
    color: Colors.successUnderline,
    borderColor: Colors.successUnderline + "66",
    backgroundColor: Colors.successUnderline + "1c",
  },
  decisionRedo: {
    color: Colors.dangerUnderline,
    borderColor: Colors.dangerUnderline + "66",
    backgroundColor: Colors.dangerUnderline + "1c",
  },
  producerNoteBlock: {
    marginTop: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.gradientMid + "15",
    borderLeftWidth: 3,
    borderLeftColor: Colors.gradientMid,
    gap: 2,
  },
  producerNoteLabel: {
    color: Colors.gradientMid,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  producerNoteText: {
    color: Colors.textPrimary,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    lineHeight: 18,
  },
  timestampLink: {
    color: Colors.gradientMid,
    fontFamily: "Inter_700Bold",
    textDecorationLine: "underline",
  },
  memoBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    marginTop: 6,
    borderRadius: 8,
    backgroundColor: Colors.gradientMid + "10",
    borderWidth: 1,
    borderColor: Colors.gradientMid + "33",
  },
  memoDuration: {
    color: Colors.gradientMid,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  aiNotesBlock: { marginTop: 4 },
  aiNotesLabel: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  empty: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 12, fontStyle: "italic" },
  error: { color: Colors.dangerUnderline, fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 24 },
});
