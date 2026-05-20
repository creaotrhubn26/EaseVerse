import React, { useCallback, useEffect, useState } from "react";
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

type BoothTake = {
  id: string;
  filename: string;
  uploadedAt: string;
  durationSec: number | null;
  status: string;
  audioUrl: string;
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
    const interval = setInterval(() => void load(), 7000);
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
            data?.takes.map((t) => (
              <View key={t.id} style={styles.takeRow}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.takeName} numberOfLines={1}>
                    {t.filename}
                  </Text>
                  <Text style={styles.takeMeta}>
                    {t.durationSec ? `${t.durationSec.toFixed(1)}s · ` : ""}
                    {t.pitchMeanHz ? `${t.pitchMeanHz.toFixed(0)} Hz · ` : ""}
                    {t.energyAvgDb !== null ? `${t.energyAvgDb} dB · ` : ""}
                    {new Date(t.uploadedAt).toLocaleTimeString()}
                  </Text>
                  {Platform.OS === "web" && t.audioUrl ? (
                    <audio
                      controls
                      preload="none"
                      src={t.audioUrl}
                      style={{
                        width: "100%",
                        height: 32,
                        marginTop: 2,
                      }}
                    />
                  ) : null}
                  {t.aiNotes ? <Text style={styles.takeNotes}>{t.aiNotes}</Text> : null}
                </View>
                <Text style={[styles.statusBadge, { color: statusColor(t.status) }]}>{t.status}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
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
  empty: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 12, fontStyle: "italic" },
  error: { color: Colors.dangerUnderline, fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 24 },
});
