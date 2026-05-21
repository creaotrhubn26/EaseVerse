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
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { parseProducerNote, formatTimestamp } from "@/lib/parse-timestamps";
import { startClick, type ClickHandle } from "@/lib/click-track";
import { currentPushEndpoint, subscribeToPush, unsubscribeFromPush } from "@/lib/push-client";
import { castVote, clearVote, fetchVoteTally, type ConsensusVote } from "@/lib/takes-client";
import { CLERK_CONFIGURED } from "@/lib/use-app-user";
import { TakeWaveform, type TakeWaveformHandle } from "@/components/TakeWaveform";

type BoothRegion = {
  id: string;
  startSec: number;
  endSec: number;
  label: string | null;
  color: string | null;
  autoLoop: boolean;
};

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
  decisionLockedAt: string | null;
  consensus: { agree: number; disagree: number };
  regions: BoothRegion[];
  lyricsSnapshot: string | null;
  lyricsSnapshotAt: string | null;
  transcript: string | null;
  aiNotes: string | null;
  pitchMeanHz: number | null;
  energyAvgDb: number | null;
};

type BoothPayload = {
  trackId: string;
  lyrics: { title: string | null; lyrics: string | null; bpm: number | null; updatedAt: string } | null;
  referenceTrack: { url: string; name: string | null; durationSec: number | null } | null;
  takes: BoothTake[];
};

const BOOTH_TIP_KEY = "@easeverse_booth_intro_dismissed_v1";

export default function BoothScreen() {
  const insets = useSafeAreaInsets();
  const { trackId } = useLocalSearchParams<{ trackId: string }>();
  const [data, setData] = useState<BoothPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [introVisible, setIntroVisible] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(BOOTH_TIP_KEY).then((v) => {
      if (v !== "1") setIntroVisible(true);
    });
  }, []);

  function dismissIntro() {
    setIntroVisible(false);
    void AsyncStorage.setItem(BOOTH_TIP_KEY, "1");
  }

  const clickRef = useRef<ClickHandle | null>(null);
  const [clickOn, setClickOn] = useState(false);
  const [bpmOverride, setBpmOverride] = useState<number | null>(null);
  const effectiveBpm = bpmOverride ?? data?.lyrics?.bpm ?? 100;

  function toggleClick() {
    if (clickRef.current && clickRef.current.isRunning()) {
      clickRef.current.stop();
      clickRef.current = null;
      setClickOn(false);
      return;
    }
    clickRef.current = startClick({ bpm: effectiveBpm, beatsPerBar: 4, accentDownbeat: true });
    setClickOn(true);
  }

  useEffect(() => {
    return () => {
      clickRef.current?.stop();
    };
  }, []);

  const auth = useBoothAuth();
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    void currentPushEndpoint().then((e) => setPushOn(!!e));
  }, []);

  async function togglePush() {
    setPushBusy(true);
    try {
      const token = await auth.getToken();
      if (pushOn) {
        await unsubscribeFromPush(token);
        setPushOn(false);
      } else {
        const sub = await subscribeToPush(token);
        setPushOn(!!sub);
      }
    } finally {
      setPushBusy(false);
    }
  }

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

  // Prefer SSE for sub-second push from the server. Falls back to 2s
  // polling for native (no EventSource) or when the stream errors out.
  useEffect(() => {
    if (!trackId) return;
    const hasEventSource = typeof window !== "undefined" && typeof EventSource !== "undefined";
    if (!hasEventSource) {
      void load();
      const interval = setInterval(() => void load(), 2000);
      return () => clearInterval(interval);
    }
    const url = `${getApiUrl()}/api/booth/stream?trackId=${encodeURIComponent(String(trackId))}`;
    const es = new EventSource(url);
    es.addEventListener("snapshot", (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data) as BoothPayload;
        setData(payload);
        setError(null);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    });
    es.onerror = () => {
      // EventSource auto-reconnects with the `retry` hint, so we just
      // surface a soft error if it doesn't recover in time.
      setLoading(false);
    };
    return () => es.close();
  }, [trackId, load]);

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
        {Platform.OS === "web" ? (
          <Pressable
            onPress={toggleClick}
            style={[styles.clickBtn, clickOn && styles.clickBtnActive]}
            accessibilityRole="button"
            accessibilityLabel={clickOn ? "Stop click track" : "Start click track"}
          >
            <Ionicons
              name={clickOn ? "stop" : "musical-notes"}
              size={13}
              color={clickOn ? "#fff" : Colors.gradientStart}
            />
            <Text style={[styles.clickBtnText, clickOn && { color: "#fff" }]}>
              {clickOn ? `${effectiveBpm} BPM` : "Click"}
            </Text>
          </Pressable>
        ) : null}
        {data?.lyrics?.bpm && !clickOn ? (
          <Text style={styles.bpm}>{data.lyrics.bpm} BPM</Text>
        ) : null}
        {Platform.OS === "web" && typeof Notification !== "undefined" ? (
          <Pressable
            onPress={togglePush}
            disabled={pushBusy}
            style={[styles.clickBtn, pushOn && styles.clickBtnActive]}
            accessibilityRole="button"
            accessibilityLabel={pushOn ? "Disable push notifications" : "Enable push notifications"}
          >
            <Ionicons
              name={pushOn ? "notifications" : "notifications-outline"}
              size={13}
              color={pushOn ? "#fff" : Colors.gradientStart}
            />
          </Pressable>
        ) : null}
      </View>

      {introVisible ? (
        <View style={styles.introCard}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.introTitle}>Velkommen til vokalbooten</Text>
            <Text style={styles.introBody}>
              Nye takes dukker opp her etter hvert som produsenten laster opp.
              Trykk en{" "}
              <Text style={styles.introCode}>@1:23</Text>
              {" "}i en producer-note for å hoppe rett til den sekundet, eller{" "}
              <Text style={styles.introCode}>Loop</Text>
              {" "}på en region producer har merket av for å høre den i ring.
            </Text>
          </View>
          <Pressable
            onPress={dismissIntro}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Skjul intro"
          >
            <Ionicons name="close" size={18} color={Colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}

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

          {data?.referenceTrack && Platform.OS === "web" ? (
            <View style={styles.refCard}>
              <Text style={styles.sectionLabel}>Reference</Text>
              <Text style={styles.refName} numberOfLines={1}>
                {data.referenceTrack.name || "Reference track"}
              </Text>
              <audio
                controls
                preload="none"
                src={data.referenceTrack.url}
                style={{ width: "100%", height: 32, marginTop: 4 }}
              />
            </View>
          ) : null}

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

function useBoothAuth(): { getToken: () => Promise<string | null> } {
  if (CLERK_CONFIGURED) {
    const mod = require("@clerk/clerk-expo") as typeof import("@clerk/clerk-expo");
    const ctx = mod.useAuth();
    return { getToken: () => ctx.getToken() };
  }
  return { getToken: async () => null };
}

function TakeCard({ take }: { take: BoothTake }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<TakeWaveformHandle | null>(null);
  const noteSegments = parseProducerNote(take.producerNote);
  const noteMarkers = noteSegments
    .filter((s): s is { kind: "timestamp"; raw: string; seconds: number } => s.kind === "timestamp")
    .map((s) => ({ seconds: s.seconds, label: s.raw, color: Colors.gradientMid }));
  const [myVote, setMyVote] = useState<ConsensusVote | null>(null);
  const [tally, setTally] = useState(take.consensus);
  const [voting, setVoting] = useState(false);
  const [disagreeDraft, setDisagreeDraft] = useState("");
  const [disagreePromptOpen, setDisagreePromptOpen] = useState(false);
  const auth = useBoothAuth();
  const [authedToken, setAuthedToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void auth.getToken().then((t) => {
      if (cancelled) return;
      setAuthedToken(t);
      if (t) {
        void fetchVoteTally(t, take.id)
          .then((res) => {
            if (cancelled) return;
            setTally({ agree: res.agree, disagree: res.disagree });
            setMyVote(res.myVote);
          })
          .catch(() => undefined);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [take.id]);

  useEffect(() => {
    setTally(take.consensus);
  }, [take.consensus.agree, take.consensus.disagree, take.consensus]);

  async function vote(next: ConsensusVote, comment?: string) {
    if (!authedToken) return;
    setVoting(true);
    try {
      if (myVote === next) {
        const t = await clearVote(authedToken, take.id);
        setMyVote(t.myVote);
        setTally({ agree: t.agree, disagree: t.disagree });
      } else {
        const t = await castVote(authedToken, take.id, next, comment);
        setMyVote(t.myVote);
        setTally({ agree: t.agree, disagree: t.disagree });
      }
      setDisagreePromptOpen(false);
      setDisagreeDraft("");
    } catch (err) {
      console.warn("vote failed:", err);
    } finally {
      setVoting(false);
    }
  }

  function scrubTo(seconds: number) {
    if (waveformRef.current) {
      waveformRef.current.seekTo(seconds);
      waveformRef.current.play();
      return;
    }
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = seconds;
    void el.play().catch(() => undefined);
  }

  return (
    <View style={[styles.takeRow, { flexDirection: "column", alignItems: "stretch" }]}>
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
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
          <TakeWaveform
            ref={waveformRef}
            audioUrl={take.audioUrl}
            markers={noteMarkers}
            regions={take.regions.map((r) => ({
              start: r.startSec,
              end: r.endSec,
              label: r.label ?? undefined,
              color: r.color ?? Colors.gradientStart,
            }))}
            height={48}
          />
        ) : null}
        {take.regions.length > 0 && Platform.OS === "web" ? (
          <View style={styles.regionList}>
            <Text style={styles.regionsHeader}>Producer asks for:</Text>
            {take.regions.map((r) => (
              <View key={r.id} style={styles.regionRow}>
                <Text style={styles.regionLabel} numberOfLines={1}>
                  {r.label || "Section"} · {formatTimestamp(r.startSec)}–{formatTimestamp(r.endSec)}
                </Text>
                <Pressable
                  onPress={() => waveformRef.current?.loopRegion(r.startSec, r.endSec)}
                  style={styles.loopBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Loop ${r.label || "section"}`}
                >
                  <Ionicons name="repeat" size={11} color={Colors.gradientStart} />
                  <Text style={styles.loopBtnText}>Loop</Text>
                </Pressable>
              </View>
            ))}
            <Pressable
              onPress={() => waveformRef.current?.clearLoop()}
              style={[styles.loopBtn, { alignSelf: "flex-start" }]}
            >
              <Text style={[styles.loopBtnText, { color: Colors.textSecondary }]}>Stop loop</Text>
            </Pressable>
          </View>
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
        {take.lyricsSnapshotAt ? (
          <Text style={styles.lyricsVersionHint} numberOfLines={1}>
            Sung against lyrics from {new Date(take.lyricsSnapshotAt).toLocaleString()}
          </Text>
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
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Text
              style={[
                styles.decisionBadge,
                take.producerDecision === "keeper" ? styles.decisionKeeper : styles.decisionRedo,
              ]}
            >
              {take.producerDecision === "keeper" ? "Keeper" : "Re-do"}
              {take.decisionLockedAt ? " · 🔒" : ""}
            </Text>
            <Text style={styles.tallyText}>
              👍 {tally.agree} · 👎 {tally.disagree}
            </Text>
          </View>
        ) : null}
        <Text style={[styles.statusBadge, { color: statusColor(take.status) }]}>{take.status}</Text>
      </View>
    </View>
    {take.producerDecision && authedToken ? (
      <View style={styles.voteRow}>
        <Text style={styles.voteRowLabel}>Your vote:</Text>
        <Pressable
          onPress={() => vote("agree")}
          disabled={voting}
          style={[styles.voteBtn, myVote === "agree" && styles.voteBtnActive]}
          accessibilityRole="button"
          accessibilityLabel="Agree with producer"
        >
          <Text style={[styles.voteBtnText, myVote === "agree" && { color: Colors.successUnderline }]}>
            👍 Agree
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (myVote === "disagree") void vote("disagree");
            else setDisagreePromptOpen(true);
          }}
          disabled={voting}
          style={[styles.voteBtn, myVote === "disagree" && styles.voteBtnActive]}
          accessibilityRole="button"
          accessibilityLabel="Disagree with producer"
        >
          <Text style={[styles.voteBtnText, myVote === "disagree" && { color: Colors.dangerUnderline }]}>
            👎 Disagree
          </Text>
        </Pressable>
      </View>
    ) : null}
    {disagreePromptOpen && Platform.OS === "web" ? (
      <View style={styles.disagreePrompt}>
        <Text style={styles.disagreePromptLabel}>Why? (required)</Text>
        <textarea
          value={disagreeDraft}
          onChange={(e: { target: { value: string } }) => setDisagreeDraft(e.target.value)}
          placeholder="Take #4 had a stronger verse 2"
          rows={2}
          style={{
            width: "100%",
            padding: 8,
            borderRadius: 8,
            border: "1px solid #262833",
            background: "#1a1c25",
            color: "#f3f4f8",
            font: "13px Inter, sans-serif",
            resize: "vertical",
          }}
        />
        <View style={{ flexDirection: "row", gap: 6, justifyContent: "flex-end" }}>
          <Pressable
            onPress={() => {
              setDisagreePromptOpen(false);
              setDisagreeDraft("");
            }}
            style={styles.voteBtn}
          >
            <Text style={styles.voteBtnText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => void vote("disagree", disagreeDraft)}
            disabled={!disagreeDraft.trim()}
            style={[styles.voteBtn, disagreeDraft.trim() && styles.voteBtnActive]}
          >
            <Text style={[styles.voteBtnText, disagreeDraft.trim() && { color: Colors.dangerUnderline }]}>
              Send
            </Text>
          </Pressable>
        </View>
      </View>
    ) : null}
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
  tallyText: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  voteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderGlass,
  },
  voteRowLabel: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  voteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surface,
  },
  voteBtnActive: {
    borderColor: Colors.gradientMid,
    backgroundColor: Colors.gradientMid + "1c",
  },
  voteBtnText: {
    color: Colors.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  disagreePrompt: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 6,
  },
  disagreePromptLabel: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  regionList: {
    marginTop: 6,
    gap: 4,
  },
  regionsHeader: {
    color: Colors.gradientStart,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  regionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: Colors.gradientStart + "12",
    borderWidth: 1,
    borderColor: Colors.gradientStart + "44",
  },
  regionLabel: {
    flex: 1,
    color: Colors.textPrimary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  loopBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.gradientStart + "66",
    backgroundColor: Colors.surface,
  },
  loopBtnText: {
    color: Colors.gradientStart,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
  },
  refCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 4,
  },
  refName: {
    color: Colors.textPrimary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  lyricsVersionHint: {
    color: Colors.textTertiary,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    fontStyle: "italic",
    marginTop: 4,
  },
  introCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: Colors.gradientStart + "12",
    borderWidth: 1,
    borderColor: Colors.gradientStart + "44",
  },
  introTitle: {
    color: Colors.textPrimary,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  introBody: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 17,
  },
  introCode: {
    fontFamily: "Inter_700Bold",
    color: Colors.gradientMid,
    backgroundColor: Colors.surface,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  clickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Colors.gradientStart + "55",
    backgroundColor: Colors.surface,
  },
  clickBtnActive: {
    backgroundColor: Colors.gradientStart,
    borderColor: Colors.gradientStart,
  },
  clickBtnText: {
    color: Colors.gradientStart,
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
