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
  endSession,
  joinSession,
  leaveSession,
  sendHeartbeat,
  sessionStreamUrl,
  type LiveParticipant,
  type LiveSession,
} from "@/lib/sessions-client";

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

  // Subscribe to presence SSE stream
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
    return () => es.close();
  }, [id]);

  const isProducer = !!session && user?.id === session.startedByUserId;
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
          participants.map((p) => <ParticipantTile key={p.userId} p={p} />)
        )}
      </View>

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
        </View>
      ) : null}
    </ScrollView>
  );
}

function ParticipantTile({ p }: { p: LiveParticipant }) {
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
      </View>
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
});
