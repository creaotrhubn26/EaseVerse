import React, { useCallback, useEffect, useRef, useState } from "react";
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
  armSession,
  endSession,
  joinSession,
  leaveSession,
  sendHeartbeat,
  sessionStreamUrl,
  stopSession,
  type LiveParticipant,
  type LiveSession,
} from "@/lib/sessions-client";
import { startClick, type ClickHandle } from "@/lib/click-track";
import { uploadTake } from "@/lib/takes-client";
import {
  handleIncomingSignal,
  startTalkbackAsCaller,
  type SignalMessage,
  type TalkbackHandle,
} from "@/lib/webrtc-talkback";

export default function LiveSessionScreen() {
  if (!CLERK_CONFIGURED) return null;
  return <Inner />;
}

function Inner() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { useAuth, useUser } = require("@clerk/clerk-expo") as typeof import("@clerk/clerk-expo");
  const { getToken } = useAuth();
  const { user } = useUser();
  const [session, setSession] = useState<LiveSession | null>(null);
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [micArmed, setMicArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clickRef = useRef<ClickHandle | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [countdownMs, setCountdownMs] = useState<number | null>(null);
  const [bpmInput, setBpmInput] = useState("96");
  const [clickRequested, setClickRequested] = useState(true);
  const [talkback, setTalkback] = useState<TalkbackHandle | null>(null);
  const peerStoreRef = useRef<{ pc: RTCPeerConnection | null; stream: MediaStream | null }>({
    pc: null,
    stream: null,
  });

  // Join on mount + leave on unmount.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        await joinSession(token, String(id));
        if (cancelled) return;
        heartbeatRef.current = setInterval(async () => {
          const t = await getToken();
          try {
            await sendHeartbeat(t, String(id), { micArmed });
          } catch {
            /* ignore */
          }
        }, 5000);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      void (async () => {
        try {
          const t = await getToken();
          await leaveSession(t, String(id));
        } catch {
          /* ignore */
        }
      })();
    };
  }, [id, getToken, micArmed]);

  // Subscribe to presence + signaling SSE stream
  useEffect(() => {
    if (!id) return;
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    const es = new EventSource(sessionStreamUrl(String(id)));
    es.addEventListener("presence", (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data) as {
          session: LiveSession;
          participants: LiveParticipant[];
        };
        setSession(payload.session);
        setParticipants(payload.participants);
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("signal", (evt) => {
      try {
        const sig = JSON.parse((evt as MessageEvent).data) as SignalMessage;
        void handleIncomingSignal({
          signal: sig,
          sessionId: String(id),
          getToken,
          existing: talkback,
          setHandle: setTalkback,
          refStore: peerStoreRef.current,
        });
      } catch {
        /* ignore */
      }
    });
    return () => es.close();
  }, [id, getToken, talkback]);

  useEffect(() => () => {
    talkback?.close();
    peerStoreRef.current.pc?.close();
    peerStoreRef.current.stream?.getTracks().forEach((t) => t.stop());
  }, [talkback]);

  async function startTalkbackTo(remoteUserId: string) {
    if (talkback) {
      talkback.close();
      setTalkback(null);
      return;
    }
    try {
      const handle = await startTalkbackAsCaller({
        sessionId: String(id),
        remoteUserId,
        getToken,
      });
      setTalkback(handle);
    } catch (err) {
      setError("Talkback failed: " + (err as Error).message);
    }
  }

  const isProducer = !!session && user?.id === session.startedByUserId;

  // Countdown ticker driven by session.recordingStartsAt
  useEffect(() => {
    if (!session?.recordingStartsAt) {
      setCountdownMs(null);
      return;
    }
    const target = new Date(session.recordingStartsAt).getTime();
    const tick = () => {
      const remaining = target - Date.now();
      setCountdownMs(remaining > 0 ? remaining : 0);
      if (remaining <= 0) clearInterval(timer);
    };
    tick();
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [session?.recordingStartsAt]);

  // Auto-start recording when countdown hits zero (mic must be armed)
  useEffect(() => {
    if (!session?.recordingStartsAt) return;
    if (!micArmed) return;
    if (recording) return;
    const target = new Date(session.recordingStartsAt).getTime();
    const delay = Math.max(0, target - Date.now());
    const timer = setTimeout(async () => {
      try {
        if (Platform.OS !== "web") return;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        chunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          if (blob.size < 2000 || !session) return;
          try {
            const token = await getToken();
            if (!token) return;
            const filename = `live-${session.id}-${user?.id || "anon"}-${Date.now()}.webm`;
            const file = new File([blob], filename, { type: blob.type });
            await uploadTake({
              file,
              externalTrackId: session.externalTrackId || session.id,
              token,
              projectId: session.projectId,
            });
          } catch (err) {
            setError("Upload failed: " + (err as Error).message);
          }
        };
        recorder.start();
        recorderRef.current = recorder;
        setRecording(true);
        const t = await getToken();
        await sendHeartbeat(t, String(id), { micArmed: true, recording: true });
      } catch (err) {
        setError("Mic access failed: " + (err as Error).message);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [session?.recordingStartsAt, micArmed, recording, session, getToken, id, user?.id]);

  // Stop recorder when producer clears the arm state
  useEffect(() => {
    if (session?.recordingStartsAt) return;
    if (!recording) return;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    void (async () => {
      const t = await getToken();
      try {
        await sendHeartbeat(t, String(id), { recording: false });
      } catch {
        /* ignore */
      }
    })();
  }, [session?.recordingStartsAt, recording, getToken, id]);

  // Click track follows session.clickOn + session.bpm, gated to recording window
  useEffect(() => {
    const shouldRun = session?.clickOn && session.recordingStartsAt && session.bpm && !session.recordingStoppedAt;
    if (shouldRun) {
      if (!clickRef.current) {
        clickRef.current = startClick({ bpm: session!.bpm!, beatsPerBar: 4, accentDownbeat: true });
      }
    } else {
      clickRef.current?.stop();
      clickRef.current = null;
    }
    return () => {
      // unmount-only cleanup is via separate effect below
    };
  }, [session?.clickOn, session?.bpm, session?.recordingStartsAt, session?.recordingStoppedAt]);

  useEffect(() => () => {
    clickRef.current?.stop();
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  async function handleRecAll() {
    if (!session) return;
    try {
      const token = await getToken();
      const bpm = Math.max(20, Math.min(300, parseInt(bpmInput, 10) || 96));
      await armSession(token, session.id, { countdownSec: 4, bpm, clickOn: clickRequested });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleStopAll() {
    if (!session) return;
    try {
      const token = await getToken();
      await stopSession(token, session.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  const onlineCount = participants.filter((p) => p.isOnline).length;
  const recordingCount = participants.filter((p) => p.recording).length;

  async function handleEnd() {
    if (!session) return;
    try {
      const token = await getToken();
      await endSession(token, session.id);
      router.back();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleMic() {
    const next = !micArmed;
    setMicArmed(next);
    try {
      const token = await getToken();
      await sendHeartbeat(token, String(id), { micArmed: next });
    } catch {
      /* ignore */
    }
  }

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
          <Text style={styles.eyebrow}>Live Session</Text>
          <Text style={styles.title} numberOfLines={1}>
            {session?.externalTrackId || "Active session"}
          </Text>
        </View>
        <View style={[styles.recordingPill, recordingCount > 0 && styles.recordingPillActive]}>
          <View style={[styles.recordingDot, recordingCount > 0 && styles.recordingDotActive]} />
          <Text style={[styles.recordingText, recordingCount > 0 && { color: "#fff" }]}>
            {recordingCount > 0 ? `REC × ${recordingCount}` : "Idle"}
          </Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {onlineCount} av {participants.length} online
        </Text>
        {isProducer ? (
          <Pressable onPress={handleEnd} style={styles.endBtn} accessibilityRole="button">
            <Text style={styles.endBtnText}>End session</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.grid}>
        {participants.length === 0 ? (
          <ActivityIndicator color={Colors.textTertiary} />
        ) : (
          participants.map((p) => (
            <ParticipantTile
              key={p.userId}
              p={p}
              talkbackActiveWith={talkback?.remoteUserId === p.userId}
              onTalkback={
                isProducer && p.userId !== user?.id && Platform.OS === "web"
                  ? () => startTalkbackTo(p.userId)
                  : undefined
              }
            />
          ))
        )}
      </View>

      {countdownMs !== null && countdownMs > 0 ? (
        <View style={styles.countdown}>
          <Text style={styles.countdownText}>{Math.ceil(countdownMs / 1000)}</Text>
          <Text style={styles.countdownHint}>
            {micArmed ? "Get ready — your mic auto-records" : "Arm your mic to join the take"}
          </Text>
        </View>
      ) : null}

      {Platform.OS === "web" ? (
        <View style={styles.controls}>
          <Pressable
            onPress={toggleMic}
            style={[styles.controlBtn, micArmed && styles.controlBtnActive]}
            accessibilityRole="button"
            accessibilityLabel={micArmed ? "Disarm mic" : "Arm mic"}
          >
            <Ionicons
              name={micArmed ? "mic" : "mic-off"}
              size={16}
              color={micArmed ? "#fff" : Colors.textPrimary}
            />
            <Text style={[styles.controlText, micArmed && { color: "#fff" }]}>
              {micArmed ? "Mic armed" : "Arm mic"}
            </Text>
          </Pressable>

          {isProducer ? (
            <>
              {session?.recordingStartsAt && !session.recordingStoppedAt ? (
                <Pressable onPress={handleStopAll} style={[styles.controlBtn, styles.stopBtn]}>
                  <Ionicons name="stop" size={16} color="#fff" />
                  <Text style={[styles.controlText, { color: "#fff" }]}>Stop all</Text>
                </Pressable>
              ) : (
                <>
                  <View style={[styles.controlBtn, { paddingHorizontal: 8, gap: 4 }]}>
                    <Text style={[styles.controlText, { fontSize: 11 }]}>BPM</Text>
                    {typeof document !== "undefined" ? (
                      <input
                        type="number"
                        value={bpmInput}
                        onChange={(e) => setBpmInput(e.target.value)}
                        min={20}
                        max={300}
                        style={{
                          width: 50,
                          padding: "4px 6px",
                          borderRadius: 6,
                          border: "1px solid #262833",
                          background: "#1a1c25",
                          color: "#f3f4f8",
                          font: "12px Inter, sans-serif",
                        }}
                      />
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => setClickRequested((v) => !v)}
                    style={[styles.controlBtn, clickRequested && styles.controlBtnActive]}
                  >
                    <Ionicons
                      name="musical-notes"
                      size={14}
                      color={clickRequested ? "#fff" : Colors.textPrimary}
                    />
                    <Text style={[styles.controlText, clickRequested && { color: "#fff" }]}>
                      Click
                    </Text>
                  </Pressable>
                  <Pressable onPress={handleRecAll} style={[styles.controlBtn, styles.recBtn]}>
                    <Ionicons name="radio-button-on" size={16} color="#fff" />
                    <Text style={[styles.controlText, { color: "#fff" }]}>Rec all (4)</Text>
                  </Pressable>
                </>
              )}
            </>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

function ParticipantTile({
  p,
  talkbackActiveWith,
  onTalkback,
}: {
  p: LiveParticipant;
  talkbackActiveWith: boolean;
  onTalkback?: () => void;
}) {
  return (
    <View style={[styles.tile, !p.isOnline && { opacity: 0.45 }]}>
      <View style={styles.tileHeader}>
        <View style={[styles.statusDot, p.isOnline && styles.statusDotOnline]} />
        <Text style={styles.tileName} numberOfLines={1}>
          {p.displayName || p.userId.slice(0, 12)}
        </Text>
      </View>
      <Text style={styles.tileRole}>{labelRole(p.projectRole)}</Text>
      <View style={styles.tileBadges}>
        {p.micArmed ? (
          <View style={[styles.badge, styles.badgeMic]}>
            <Ionicons name="mic" size={11} color={Colors.gradientMid} />
            <Text style={[styles.badgeText, { color: Colors.gradientMid }]}>Mic</Text>
          </View>
        ) : null}
        {p.recording ? (
          <View style={[styles.badge, styles.badgeRec]}>
            <Ionicons name="radio-button-on" size={11} color="#fff" />
            <Text style={[styles.badgeText, { color: "#fff" }]}>REC</Text>
          </View>
        ) : null}
        {talkbackActiveWith ? (
          <View style={[styles.badge, styles.badgeTalkback]}>
            <Ionicons name="call" size={11} color="#fff" />
            <Text style={[styles.badgeText, { color: "#fff" }]}>Live</Text>
          </View>
        ) : null}
      </View>
      {onTalkback && p.isOnline ? (
        <Pressable
          onPress={onTalkback}
          style={[styles.talkbackBtn, talkbackActiveWith && styles.talkbackBtnActive]}
          accessibilityRole="button"
          accessibilityLabel={talkbackActiveWith ? "Hang up talkback" : "Open mic to this person"}
        >
          <Ionicons
            name={talkbackActiveWith ? "call" : "mic-outline"}
            size={12}
            color={talkbackActiveWith ? "#fff" : Colors.gradientStart}
          />
          <Text style={[styles.talkbackBtnText, talkbackActiveWith && { color: "#fff" }]}>
            {talkbackActiveWith ? "Hang up" : "Talkback"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
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
  recordingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surface,
  },
  recordingPillActive: {
    borderColor: Colors.dangerUnderline,
    backgroundColor: Colors.dangerUnderline,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.textTertiary,
  },
  recordingDotActive: { backgroundColor: "#fff" },
  recordingText: { color: Colors.textSecondary, fontFamily: "Inter_700Bold", fontSize: 11 },
  error: { color: Colors.dangerUnderline, fontFamily: "Inter_500Medium", fontSize: 12 },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  summaryText: { flex: 1, color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 13 },
  endBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dangerUnderline + "66",
  },
  endBtnText: { color: Colors.dangerUnderline, fontFamily: "Inter_700Bold", fontSize: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    width: 158,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 6,
  },
  tileHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.textTertiary },
  statusDotOnline: { backgroundColor: Colors.successUnderline },
  tileName: { flex: 1, color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 13 },
  tileRole: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 11 },
  tileBadges: { flexDirection: "row", gap: 5, marginTop: 4 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  badgeMic: { borderColor: Colors.gradientMid + "55", backgroundColor: Colors.gradientMid + "16" },
  badgeRec: { borderColor: Colors.dangerUnderline, backgroundColor: Colors.dangerUnderline },
  badgeTalkback: { borderColor: Colors.gradientStart, backgroundColor: Colors.gradientStart },
  talkbackBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.gradientStart + "55",
    backgroundColor: Colors.surfaceGlass,
  },
  talkbackBtnActive: { borderColor: Colors.gradientStart, backgroundColor: Colors.gradientStart },
  talkbackBtnText: { color: Colors.gradientStart, fontFamily: "Inter_700Bold", fontSize: 11 },
  badgeText: { fontFamily: "Inter_700Bold", fontSize: 10 },
  controls: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 8,
  },
  controlBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surface,
  },
  controlBtnActive: { backgroundColor: Colors.gradientStart, borderColor: Colors.gradientStart },
  controlText: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 13 },
  recBtn: { backgroundColor: Colors.dangerUnderline, borderColor: Colors.dangerUnderline },
  stopBtn: { backgroundColor: Colors.textPrimary, borderColor: Colors.textPrimary },
  countdown: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: Colors.gradientStart + "1c",
    borderWidth: 2,
    borderColor: Colors.gradientStart,
    alignItems: "center",
    gap: 6,
  },
  countdownText: {
    color: Colors.gradientStart,
    fontFamily: "Inter_700Bold",
    fontSize: 56,
    lineHeight: 60,
  },
  countdownHint: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
});
