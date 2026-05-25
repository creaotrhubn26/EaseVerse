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
import {
  fetchDawBundleStatus,
  fetchDebrief,
  fetchLiveSessionTakes,
  fetchMixdownStatus,
  startDawExport,
  startDebrief,
  startMixdown,
  type DawBundleStatus,
  type Debrief,
  type LiveSessionTake,
  type MixdownStatus,
} from "@/lib/sessions-client";

export default function LiveSessionReviewScreen() {
  if (!CLERK_CONFIGURED) return null;
  return <Inner />;
}

function Inner() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { useAuth } = require("@clerk/clerk-expo") as typeof import("@clerk/clerk-expo");
  const { getToken } = useAuth();

  const [takes, setTakes] = useState<LiveSessionTake[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [maxDurationSec, setMaxDurationSec] = useState(0);
  const [muted, setMuted] = useState<Record<string, boolean>>({});
  const [soloId, setSoloId] = useState<string | null>(null);
  const audiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [mixdown, setMixdown] = useState<MixdownStatus | null>(null);
  const [mixdownBusy, setMixdownBusy] = useState(false);
  const mixdownPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [debriefBusy, setDebriefBusy] = useState(false);
  const debriefPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [dawBundle, setDawBundle] = useState<DawBundleStatus | null>(null);
  const [dawBundleBusy, setDawBundleBusy] = useState(false);
  const dawBundlePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const data = await fetchLiveSessionTakes(token, String(id));
      setTakes(data.takes);
      const longest = data.takes.reduce(
        (acc, t) => Math.max(acc, (t.durationSec ?? 0) + t.offsetSec),
        0,
      );
      setMaxDurationSec(longest);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id, getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMixdown = useCallback(async () => {
    if (!id) return;
    try {
      const token = await getToken();
      const status = await fetchMixdownStatus(token, String(id));
      setMixdown(status);
      return status;
    } catch {
      return null;
    }
  }, [id, getToken]);

  useEffect(() => {
    void loadMixdown();
  }, [loadMixdown]);

  useEffect(() => {
    if (mixdown?.status !== "processing") {
      if (mixdownPollRef.current) clearInterval(mixdownPollRef.current);
      mixdownPollRef.current = null;
      return;
    }
    if (mixdownPollRef.current) return;
    mixdownPollRef.current = setInterval(() => {
      void loadMixdown();
    }, 3000);
    return () => {
      if (mixdownPollRef.current) clearInterval(mixdownPollRef.current);
      mixdownPollRef.current = null;
    };
  }, [mixdown?.status, loadMixdown]);

  const loadDebrief = useCallback(async () => {
    if (!id) return;
    try {
      const token = await getToken();
      const data = await fetchDebrief(token, String(id));
      setDebrief(data);
      return data;
    } catch {
      return null;
    }
  }, [id, getToken]);

  useEffect(() => {
    void loadDebrief();
  }, [loadDebrief]);

  useEffect(() => {
    if (debrief?.status !== "processing") {
      if (debriefPollRef.current) clearInterval(debriefPollRef.current);
      debriefPollRef.current = null;
      return;
    }
    if (debriefPollRef.current) return;
    debriefPollRef.current = setInterval(() => {
      void loadDebrief();
    }, 3000);
    return () => {
      if (debriefPollRef.current) clearInterval(debriefPollRef.current);
      debriefPollRef.current = null;
    };
  }, [debrief?.status, loadDebrief]);

  const triggerDebrief = useCallback(async () => {
    if (!id) return;
    setDebriefBusy(true);
    try {
      const token = await getToken();
      await startDebrief(token, String(id));
      await loadDebrief();
    } catch (err) {
      setError("Debrief failed: " + (err as Error).message);
    } finally {
      setDebriefBusy(false);
    }
  }, [id, getToken, loadDebrief]);

  const loadDawBundle = useCallback(async () => {
    if (!id) return;
    try {
      const token = await getToken();
      const status = await fetchDawBundleStatus(token, String(id));
      setDawBundle(status);
      return status;
    } catch {
      return null;
    }
  }, [id, getToken]);

  useEffect(() => {
    void loadDawBundle();
  }, [loadDawBundle]);

  useEffect(() => {
    if (dawBundle?.status !== "processing") {
      if (dawBundlePollRef.current) clearInterval(dawBundlePollRef.current);
      dawBundlePollRef.current = null;
      return;
    }
    if (dawBundlePollRef.current) return;
    dawBundlePollRef.current = setInterval(() => {
      void loadDawBundle();
    }, 3000);
    return () => {
      if (dawBundlePollRef.current) clearInterval(dawBundlePollRef.current);
      dawBundlePollRef.current = null;
    };
  }, [dawBundle?.status, loadDawBundle]);

  const triggerDawExport = useCallback(async () => {
    if (!id) return;
    setDawBundleBusy(true);
    try {
      const token = await getToken();
      await startDawExport(token, String(id));
      await loadDawBundle();
    } catch (err) {
      setError("DAW export failed: " + (err as Error).message);
    } finally {
      setDawBundleBusy(false);
    }
  }, [id, getToken, loadDawBundle]);

  const triggerMixdown = useCallback(async () => {
    if (!id) return;
    setMixdownBusy(true);
    try {
      const token = await getToken();
      await startMixdown(token, String(id));
      await loadMixdown();
    } catch (err) {
      setError("Mixdown failed: " + (err as Error).message);
    } finally {
      setMixdownBusy(false);
    }
  }, [id, getToken, loadMixdown]);

  // Create / refresh hidden audio elements when takes change (web only)
  useEffect(() => {
    if (typeof document === "undefined") return;
    const map = audiosRef.current;
    for (const t of takes) {
      if (!map.has(t.takeId)) {
        const el = document.createElement("audio");
        el.src = t.storageUrl;
        el.preload = "auto";
        el.crossOrigin = "anonymous";
        el.style.display = "none";
        document.body.appendChild(el);
        map.set(t.takeId, el);
      }
    }
    // remove stale
    for (const [takeId, el] of map.entries()) {
      if (!takes.find((t) => t.takeId === takeId)) {
        el.pause();
        el.remove();
        map.delete(takeId);
      }
    }
    return undefined;
  }, [takes]);

  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (mixdownPollRef.current) clearInterval(mixdownPollRef.current);
    if (debriefPollRef.current) clearInterval(debriefPollRef.current);
    if (dawBundlePollRef.current) clearInterval(dawBundlePollRef.current);
    for (const el of audiosRef.current.values()) {
      el.pause();
      el.remove();
    }
    audiosRef.current.clear();
  }, []);

  // Apply mute/solo
  useEffect(() => {
    for (const t of takes) {
      const el = audiosRef.current.get(t.takeId);
      if (!el) continue;
      const isMuted = muted[t.takeId] === true;
      const isSilenced = soloId !== null && soloId !== t.takeId;
      el.muted = isMuted || isSilenced;
    }
  }, [muted, soloId, takes]);

  const play = useCallback(async () => {
    if (typeof document === "undefined") return;
    setIsPlaying(true);
    const startMs = performance.now();
    const startSec = currentSec;
    for (const t of takes) {
      const el = audiosRef.current.get(t.takeId);
      if (!el) continue;
      const localTime = Math.max(0, startSec - t.offsetSec);
      try {
        el.currentTime = localTime;
        await el.play();
      } catch {
        /* ignore autoplay blocks */
      }
    }
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      const elapsed = (performance.now() - startMs) / 1000;
      const next = startSec + elapsed;
      setCurrentSec(next);
      if (next >= maxDurationSec) {
        setIsPlaying(false);
        for (const el of audiosRef.current.values()) el.pause();
        if (tickRef.current) clearInterval(tickRef.current);
        tickRef.current = null;
      }
    }, 100);
  }, [currentSec, takes, maxDurationSec]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    for (const el of audiosRef.current.values()) el.pause();
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  }, []);

  const seek = useCallback(
    (sec: number) => {
      const target = Math.max(0, Math.min(maxDurationSec, sec));
      setCurrentSec(target);
      for (const t of takes) {
        const el = audiosRef.current.get(t.takeId);
        if (!el) continue;
        el.currentTime = Math.max(0, target - t.offsetSec);
      }
    },
    [maxDurationSec, takes],
  );

  const toggleMuted = useCallback((takeId: string) => {
    setMuted((m) => ({ ...m, [takeId]: !m[takeId] }));
  }, []);

  const toggleSolo = useCallback(
    (takeId: string) => setSoloId((s) => (s === takeId ? null : takeId)),
    [],
  );

  const grouped = useMemo(() => takes.slice().sort((a, b) => a.offsetSec - b.offsetSec), [takes]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + 14,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 14,
        gap: 12,
      }}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Session review</Text>
          <Text style={styles.title} numberOfLines={1}>
            Multi-track playback
          </Text>
        </View>
        <Pressable onPress={() => void load()} hitSlop={8} accessibilityLabel="Reload takes">
          <Ionicons name="refresh" size={18} color={Colors.textSecondary} />
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={Colors.textTertiary} />
      ) : grouped.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            No takes uploaded yet for this session. Once a member finishes recording, refresh to see the stacked playback.
          </Text>
        </View>
      ) : (
        <>
          {Platform.OS === "web" ? (
            <View style={styles.transport}>
              <Pressable
                onPress={isPlaying ? pause : () => void play()}
                style={[styles.controlBtn, isPlaying && styles.controlBtnActive]}
                accessibilityRole="button"
                accessibilityLabel={isPlaying ? "Pause" : "Play"}
              >
                <Ionicons
                  name={isPlaying ? "pause" : "play"}
                  size={18}
                  color={isPlaying ? "#fff" : Colors.textPrimary}
                />
                <Text style={[styles.controlText, isPlaying && { color: "#fff" }]}>
                  {isPlaying ? "Pause" : "Play all"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => seek(0)}
                style={styles.controlBtn}
                accessibilityRole="button"
                accessibilityLabel="Restart"
              >
                <Ionicons name="play-skip-back" size={16} color={Colors.textPrimary} />
                <Text style={styles.controlText}>Restart</Text>
              </Pressable>
              <Text style={styles.timeText}>
                {formatTime(currentSec)} / {formatTime(maxDurationSec)}
              </Text>
            </View>
          ) : (
            <Text style={styles.nativeHint}>
              Multi-track synchronized playback is web-only for now. Open this session on desktop or
              the PWA to mix tracks together.
            </Text>
          )}

          <View style={styles.debriefRow}>
            <Pressable
              onPress={triggerDebrief}
              disabled={debriefBusy || debrief?.status === "processing"}
              style={[
                styles.controlBtn,
                (debriefBusy || debrief?.status === "processing") && { opacity: 0.5 },
                debrief?.status === "done" && styles.controlBtnActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Run AI session debrief"
            >
              <Ionicons
                name="sparkles-outline"
                size={16}
                color={debrief?.status === "done" ? "#fff" : Colors.textPrimary}
              />
              <Text
                style={[
                  styles.controlText,
                  debrief?.status === "done" && { color: "#fff" },
                ]}
              >
                {debrief?.status === "processing"
                  ? "Analysing…"
                  : debrief?.status === "done"
                    ? "Re-run debrief"
                    : "AI debrief"}
              </Text>
            </Pressable>
            {debrief?.status === "error" ? (
              <Text style={styles.mixdownError} numberOfLines={2}>
                {debrief.errorMessage || "Debrief failed"}
              </Text>
            ) : null}
          </View>

          {debrief?.status === "done" && debrief.sections && debrief.sections.length > 0 ? (
            <View style={styles.debriefPanel}>
              {debrief.overallNotes ? (
                <Text style={styles.debriefOverall}>{debrief.overallNotes}</Text>
              ) : null}
              {debrief.sections.map((s, idx) => {
                const winner = grouped.find((t) => t.takeId === s.winnerTakeId);
                const runnerUp = grouped.find((t) => t.takeId === s.runnerUpTakeId);
                return (
                  <View key={`${s.label}-${idx}`} style={styles.debriefSection}>
                    <View style={styles.debriefSectionHeader}>
                      <Text style={styles.debriefSectionLabel}>{s.label}</Text>
                      <Text style={styles.debriefSectionRange}>
                        {formatTime(s.startSec)} – {formatTime(s.endSec)}
                      </Text>
                    </View>
                    {winner ? (
                      <View style={styles.debriefPick}>
                        <Ionicons name="trophy-outline" size={13} color={Colors.gradientStart} />
                        <Text style={styles.debriefPickText}>
                          Winner: {winner.displayName || winner.userId.slice(0, 8)}
                        </Text>
                        <Pressable
                          onPress={() => seek(s.startSec)}
                          style={styles.debriefJump}
                          accessibilityLabel="Jump to section"
                        >
                          <Ionicons name="play" size={11} color="#fff" />
                        </Pressable>
                      </View>
                    ) : null}
                    {runnerUp ? (
                      <Text style={styles.debriefRunnerUp}>
                        Runner-up: {runnerUp.displayName || runnerUp.userId.slice(0, 8)}
                      </Text>
                    ) : null}
                    {s.notes ? <Text style={styles.debriefNotes}>{s.notes}</Text> : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          <View style={styles.mixdownRow}>
            <Pressable
              onPress={triggerMixdown}
              disabled={mixdownBusy || mixdown?.status === "processing"}
              style={[
                styles.controlBtn,
                (mixdownBusy || mixdown?.status === "processing") && { opacity: 0.5 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Bounce to WAV"
            >
              <Ionicons name="cloud-download-outline" size={16} color={Colors.textPrimary} />
              <Text style={styles.controlText}>
                {mixdown?.status === "processing"
                  ? "Mixing…"
                  : mixdown?.status === "done"
                    ? "Re-mix"
                    : "Bounce to WAV"}
              </Text>
            </Pressable>
            {mixdown?.status === "done" && mixdown.url ? (
              <Pressable
                onPress={() => {
                  if (typeof window !== "undefined") window.open(mixdown.url!, "_blank");
                }}
                style={[styles.controlBtn, styles.controlBtnActive]}
                accessibilityRole="link"
                accessibilityLabel="Download mixed WAV"
              >
                <Ionicons name="download-outline" size={16} color="#fff" />
                <Text style={[styles.controlText, { color: "#fff" }]}>Download WAV</Text>
              </Pressable>
            ) : null}
            {mixdown?.status === "error" ? (
              <Text style={styles.mixdownError} numberOfLines={2}>
                {mixdown.error || "Mixdown failed"}
              </Text>
            ) : null}

            <Pressable
              onPress={triggerDawExport}
              disabled={dawBundleBusy || dawBundle?.status === "processing"}
              style={[
                styles.controlBtn,
                (dawBundleBusy || dawBundle?.status === "processing") && { opacity: 0.5 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Export to DAW bundle"
            >
              <Ionicons name="musical-notes-outline" size={16} color={Colors.textPrimary} />
              <Text style={styles.controlText}>
                {dawBundle?.status === "processing"
                  ? "Packing…"
                  : dawBundle?.status === "done"
                    ? "Re-pack DAW"
                    : "Export to DAW"}
              </Text>
            </Pressable>
            {dawBundle?.status === "done" && dawBundle.url ? (
              <Pressable
                onPress={() => {
                  if (typeof window !== "undefined") window.open(dawBundle.url!, "_blank");
                }}
                style={[styles.controlBtn, styles.controlBtnActive]}
                accessibilityRole="link"
                accessibilityLabel="Download DAW bundle"
              >
                <Ionicons name="download-outline" size={16} color="#fff" />
                <Text style={[styles.controlText, { color: "#fff" }]}>Download .zip</Text>
              </Pressable>
            ) : null}
            {dawBundle?.status === "error" ? (
              <Text style={styles.mixdownError} numberOfLines={2}>
                {dawBundle.error || "DAW export failed"}
              </Text>
            ) : null}
          </View>

          {Platform.OS === "web" && maxDurationSec > 0 ? (
            <View style={styles.seekRow}>
              {typeof document !== "undefined" ? (
                <input
                  type="range"
                  min={0}
                  max={Math.round(maxDurationSec * 10)}
                  value={Math.round(currentSec * 10)}
                  onChange={(e) => seek(parseInt(e.target.value, 10) / 10)}
                  style={{ flex: 1, accentColor: "#FF7A18" }}
                />
              ) : null}
            </View>
          ) : null}

          {grouped.map((t) => {
            const isMuted = muted[t.takeId] === true;
            const isSolo = soloId === t.takeId;
            const isSilenced = soloId !== null && !isSolo;
            const lengthSec = t.durationSec ?? 0;
            const widthPct =
              maxDurationSec > 0
                ? Math.min(1, lengthSec / maxDurationSec) * 100
                : 100;
            const leftPct =
              maxDurationSec > 0 ? Math.min(1, t.offsetSec / maxDurationSec) * 100 : 0;
            const playheadPct =
              maxDurationSec > 0 ? Math.min(1, currentSec / maxDurationSec) * 100 : 0;
            return (
              <View key={t.takeId} style={styles.trackRow}>
                <View style={styles.trackHeader}>
                  <Text style={styles.trackName} numberOfLines={1}>
                    {t.displayName || t.userId.slice(0, 12)}
                  </Text>
                  <Text style={styles.trackRole}>{labelRole(t.projectRole)}</Text>
                </View>
                <View style={styles.trackTimeline}>
                  <View
                    style={[
                      styles.trackBlock,
                      {
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        opacity: isMuted || isSilenced ? 0.3 : 1,
                      },
                    ]}
                  />
                  {Platform.OS === "web" && maxDurationSec > 0 ? (
                    <View style={[styles.playhead, { left: `${playheadPct}%` }]} />
                  ) : null}
                </View>
                <View style={styles.trackMeta}>
                  <Text style={styles.trackMetaText}>
                    {formatTime(t.offsetSec)} · {lengthSec ? `${lengthSec.toFixed(1)}s` : "—"}
                  </Text>
                  {Platform.OS === "web" ? (
                    <View style={styles.trackBtns}>
                      <Pressable
                        onPress={() => toggleMuted(t.takeId)}
                        style={[styles.smallBtn, isMuted && styles.smallBtnActive]}
                        accessibilityRole="button"
                        accessibilityLabel={isMuted ? "Unmute" : "Mute"}
                      >
                        <Text style={[styles.smallBtnText, isMuted && { color: "#fff" }]}>M</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => toggleSolo(t.takeId)}
                        style={[styles.smallBtn, isSolo && styles.smallBtnSolo]}
                        accessibilityRole="button"
                        accessibilityLabel={isSolo ? "Unsolo" : "Solo"}
                      >
                        <Text style={[styles.smallBtnText, isSolo && { color: "#fff" }]}>S</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function labelRole(role: string | null): string {
  switch (role) {
    case "producer": return "Producer";
    case "vocalist": return "Vocalist";
    case "band_member": return "Band";
    case "mix_engineer": return "Mix";
    case "observer": return "Observer";
    default: return "Member";
  }
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
  title: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 18, marginTop: 1 },
  error: { color: Colors.dangerUnderline, fontFamily: "Inter_500Medium", fontSize: 12 },
  empty: {
    padding: 18,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  emptyText: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 13 },
  nativeHint: {
    color: Colors.textTertiary,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: Colors.surfaceGlass,
  },
  transport: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  controlBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surface,
  },
  controlBtnActive: { backgroundColor: Colors.gradientStart, borderColor: Colors.gradientStart },
  controlText: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 12 },
  timeText: {
    marginLeft: "auto",
    color: Colors.textSecondary,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  seekRow: { flexDirection: "row", paddingHorizontal: 2 },
  mixdownRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  debriefRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  debriefPanel: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gradientStart + "33",
    backgroundColor: Colors.gradientStart + "0a",
    gap: 10,
  },
  debriefOverall: {
    color: Colors.textPrimary,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    lineHeight: 18,
  },
  debriefSection: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderGlass,
    gap: 4,
  },
  debriefSectionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  debriefSectionLabel: {
    flex: 1,
    color: Colors.textPrimary,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  debriefSectionRange: {
    color: Colors.textTertiary,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  debriefPick: { flexDirection: "row", alignItems: "center", gap: 6 },
  debriefPickText: {
    flex: 1,
    color: Colors.gradientStart,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  debriefJump: {
    backgroundColor: Colors.gradientStart,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  debriefRunnerUp: {
    color: Colors.textTertiary,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  debriefNotes: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 17,
  },
  mixdownError: {
    color: Colors.dangerUnderline,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    flex: 1,
  },
  trackRow: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 6,
  },
  trackHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  trackName: { flex: 1, color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 13 },
  trackRole: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 11 },
  trackTimeline: {
    position: "relative",
    height: 14,
    borderRadius: 6,
    backgroundColor: Colors.surfaceGlass,
    overflow: "hidden",
  },
  trackBlock: {
    position: "absolute",
    top: 2,
    bottom: 2,
    backgroundColor: Colors.gradientMid,
    borderRadius: 4,
  },
  playhead: {
    position: "absolute",
    top: -2,
    bottom: -2,
    width: 2,
    backgroundColor: "#fff",
  },
  trackMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  trackMetaText: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 11, flex: 1 },
  trackBtns: { flexDirection: "row", gap: 4 },
  smallBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    minWidth: 26,
    alignItems: "center",
  },
  smallBtnActive: {
    borderColor: Colors.dangerUnderline,
    backgroundColor: Colors.dangerUnderline,
  },
  smallBtnSolo: {
    borderColor: Colors.gradientStart,
    backgroundColor: Colors.gradientStart,
  },
  smallBtnText: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 11 },
});
