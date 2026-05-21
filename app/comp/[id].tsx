import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { CLERK_CONFIGURED } from "@/lib/use-app-user";
import { TakeWaveform, type TakeWaveformHandle } from "@/components/TakeWaveform";
import { formatTimestamp } from "@/lib/parse-timestamps";
import {
  fetchTakeRanking,
  fetchTakes,
  getComp,
  saveCompSegments,
  type CompRecord,
  type CompSegment,
  type TakeRanking,
  type TakeRecord,
} from "@/lib/takes-client";

type Segment = { takeId: string; startSec: number; endSec: number; sectionLabel?: string };

export default function CompScreen() {
  if (!CLERK_CONFIGURED) return null;
  return <CompInner />;
}

function CompInner() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { useAuth } = require("@clerk/clerk-expo") as typeof import("@clerk/clerk-expo");
  const { getToken } = useAuth();
  const [comp, setComp] = useState<CompRecord | null>(null);
  const [serverSegments, setServerSegments] = useState<CompSegment[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [takes, setTakes] = useState<TakeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waveformRefs = useRef<Map<string, TakeWaveformHandle | null>>(new Map());
  const [ranking, setRanking] = useState<TakeRanking | null>(null);

  useEffect(() => {
    if (!comp?.externalTrackId) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        const r = await fetchTakeRanking(token, comp.externalTrackId!);
        if (!cancelled) setRanking(r);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [comp?.externalTrackId, getToken]);

  function autoFillFromAI() {
    const s = ranking?.suggestion;
    if (!s) return;
    setSegments([{ takeId: s.takeId, startSec: s.startSec, endSec: s.endSec, sectionLabel: s.sectionLabel }]);
  }

  const dirty = useMemo(() => {
    if (segments.length !== serverSegments.length) return true;
    return segments.some((s, i) => {
      const r = serverSegments[i];
      return r.takeId !== s.takeId || r.startSec !== s.startSec || r.endSec !== s.endSec;
    });
  }, [segments, serverSegments]);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const token = await getToken();
      const data = await getComp(token, String(id));
      setComp(data.comp);
      setServerSegments(data.segments);
      setSegments(
        data.segments.map((s) => ({
          takeId: s.takeId,
          startSec: s.startSec,
          endSec: s.endSec,
          sectionLabel: s.sectionLabel ?? undefined,
        })),
      );
      const allTakes = await fetchTakes(token);
      setTakes(allTakes.filter((t) => t.externalTrackId === data.comp.externalTrackId && t.status === "done"));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [getToken, id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function addSegmentFromTake(take: TakeRecord) {
    setSegments((prev) => [
      ...prev,
      {
        takeId: take.id,
        startSec: 0,
        endSec: take.durationSec || 4,
      },
    ]);
  }

  function removeSegment(i: number) {
    setSegments((prev) => prev.filter((_, idx) => idx !== i));
  }

  function moveSegment(i: number, dir: -1 | 1) {
    setSegments((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function handleSave() {
    if (!comp) return;
    setSaving(true);
    try {
      const token = await getToken();
      const fresh = await saveCompSegments(token, comp.id, segments);
      setServerSegments(fresh);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function takeForId(id: string): TakeRecord | undefined {
    return takes.find((t) => t.id === id);
  }

  function playSegment(seg: Segment) {
    const wave = waveformRefs.current.get(seg.takeId);
    if (!wave) return;
    wave.loopRegion(seg.startSec, seg.endSec);
  }

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 32, alignItems: "center" }]}>
        <ActivityIndicator color={Colors.textTertiary} />
      </View>
    );
  }
  if (!comp) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 16, padding: 16 }]}>
        <Text style={styles.error}>{error || "Comp not found."}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 32,
        paddingHorizontal: 16,
        gap: 14,
      }}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Comp</Text>
          <Text style={styles.title} numberOfLines={1}>
            {comp.name}
          </Text>
        </View>
        <Pressable
          onPress={handleSave}
          disabled={!dirty || saving}
          style={[styles.saveBtn, (!dirty || saving) && { opacity: 0.4 }]}
          accessibilityRole="button"
          accessibilityLabel="Save comp"
        >
          <Text style={styles.saveBtnText}>{saving ? "…" : dirty ? "Save" : "Saved"}</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={styles.sectionLabel}>Comp plan ({segments.length} segment{segments.length === 1 ? "" : "s"})</Text>
        {ranking?.suggestion ? (
          <Pressable
            onPress={autoFillFromAI}
            style={styles.aiBtn}
            accessibilityRole="button"
            accessibilityLabel="Auto-fill comp from AI ranking"
          >
            <Ionicons name="sparkles" size={11} color={Colors.gradientMid} />
            <Text style={styles.aiBtnText}>AI fill</Text>
          </Pressable>
        ) : null}
      </View>
      {segments.length === 0 ? (
        <Text style={styles.empty}>Empty — add segments from a take below.</Text>
      ) : (
        segments.map((seg, i) => {
          const take = takeForId(seg.takeId);
          return (
            <View key={`${seg.takeId}-${i}`} style={styles.segmentRow}>
              <Text style={styles.segmentIdx}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.segmentTake} numberOfLines={1}>
                  {take?.filename || seg.takeId}
                </Text>
                <Text style={styles.segmentRange}>
                  {formatTimestamp(seg.startSec)} → {formatTimestamp(seg.endSec)}
                  {seg.sectionLabel ? ` · ${seg.sectionLabel}` : ""}
                </Text>
              </View>
              <Pressable onPress={() => playSegment(seg)} style={styles.smallBtn}>
                <Ionicons name="play" size={11} color={Colors.gradientStart} />
              </Pressable>
              <Pressable onPress={() => moveSegment(i, -1)} disabled={i === 0} style={[styles.smallBtn, i === 0 && { opacity: 0.3 }]}>
                <Ionicons name="arrow-up" size={11} color={Colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={() => moveSegment(i, 1)}
                disabled={i === segments.length - 1}
                style={[styles.smallBtn, i === segments.length - 1 && { opacity: 0.3 }]}
              >
                <Ionicons name="arrow-down" size={11} color={Colors.textSecondary} />
              </Pressable>
              <Pressable onPress={() => removeSegment(i)} style={styles.smallBtn}>
                <Ionicons name="trash" size={11} color={Colors.dangerUnderline} />
              </Pressable>
            </View>
          );
        })
      )}

      <Text style={styles.sectionLabel}>Takes ({takes.length}) — pick sections by dragging on a waveform</Text>
      {takes.map((take) => (
        <View key={take.id} style={styles.takeBlock}>
          <View style={styles.takeHeader}>
            <Text style={styles.takeName} numberOfLines={1}>{take.filename}</Text>
            {(() => {
              const r = ranking?.ranked.find((x) => x.takeId === take.id);
              if (!r) return null;
              const isTop = ranking?.ranked[0]?.takeId === take.id;
              return (
                <Text style={[styles.scoreBadge, isTop && styles.scoreBadgeTop]}>
                  {isTop ? "★ " : ""}score {r.score}
                </Text>
              );
            })()}
            <Pressable
              onPress={() => addSegmentFromTake(take)}
              style={styles.addBtn}
              accessibilityRole="button"
              accessibilityLabel="Append entire take to comp"
            >
              <Ionicons name="add" size={12} color="#fff" />
              <Text style={styles.addBtnText}>Append</Text>
            </Pressable>
          </View>
          {Platform.OS === "web" && take.storageUrl ? (
            <TakeWaveform
              ref={(node) => {
                waveformRefs.current.set(take.id, node);
              }}
              audioUrl={take.storageUrl}
              regions={segments
                .filter((s) => s.takeId === take.id)
                .map((s, i) => ({
                  start: s.startSec,
                  end: s.endSec,
                  label: `${i + 1}`,
                  color: Colors.gradientStart,
                }))}
              height={48}
              enableDragCreate
              onRegionDrawn={(start, end) => {
                setSegments((prev) => [
                  ...prev,
                  { takeId: take.id, startSec: start, endSec: end },
                ]);
              }}
            />
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  eyebrow: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  title: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 20, marginTop: 1 },
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.gradientStart,
  },
  saveBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },
  sectionLabel: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 6,
  },
  empty: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 12, fontStyle: "italic" },
  segmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    borderRadius: 9,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.gradientStart + "44",
  },
  segmentIdx: {
    color: Colors.gradientStart,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    width: 18,
  },
  segmentTake: { color: Colors.textPrimary, fontFamily: "Inter_600SemiBold", fontSize: 12 },
  segmentRange: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 1 },
  smallBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  takeBlock: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 6,
  },
  takeHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  takeName: { flex: 1, color: Colors.textPrimary, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: Colors.gradientStart,
  },
  addBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 11 },
  error: { color: Colors.dangerUnderline, fontFamily: "Inter_500Medium", fontSize: 12 },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Colors.gradientMid + "55",
    backgroundColor: Colors.surface,
  },
  aiBtnText: { color: Colors.gradientMid, fontFamily: "Inter_700Bold", fontSize: 11 },
  scoreBadge: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  scoreBadgeTop: {
    color: Colors.gradientMid,
    borderColor: Colors.gradientMid + "55",
    backgroundColor: Colors.gradientMid + "11",
  },
});
