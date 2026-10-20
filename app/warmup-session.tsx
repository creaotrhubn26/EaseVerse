import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/creatorhub-auth";
import { authedFetch } from "@/lib/authed-fetch";
import Colors from "@/constants/colors";
import { WarmupSoundscape } from "@/components/WarmupSoundscape";
import { WarmupVoicePlayer } from "@/components/WarmupVoicePlayer";
type Step = {
  sourceId: string;
  title: string;
  type: string;
  instruction: string;
  durationSec: number;
  audioUrl?: string;
};
type Routine = {
  id: string;
  title: string;
  note?: string;
  session_title?: string;
  session_start_at?: string;
  completed_at?: string;
  steps: Step[];
};
export default function SessionWarmup() {
  return (
    <WarmupSoundscape>
      <SessionWarmupContent />
    </WarmupSoundscape>
  );
}
function SessionWarmupContent() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const [routines, setRoutines] = useState<Routine[]>([]),
    [active, setActive] = useState<Routine | null>(null),
    [index, setIndex] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const load = useCallback(async () => {
    if (!projectId) return;
    const token = await auth.getToken();
    const r = await authedFetch(
      "/api/studio-warmups?projectId=" + encodeURIComponent(projectId),
      token
    );
    if (!r.ok)
      throw Error(
        [401, 403, 404].includes(r.status)
          ? "Denne oppvarmingen er ikke tilgjengelig for kontoen din."
          : "Oppvarmingen kunne ikke hentes. Prøv igjen."
      );
    return (await r.json()).routines as Routine[];
  }, [projectId, auth.getToken]);
  useEffect(() => {
    let current = true;
    setRoutines([]);
    setActive(null);
    setError("");
    setLoading(true);
    if (!auth.isLoaded || !auth.user)
      return () => {
        current = false;
      };
    void load()
      .then((rows) => {
        if (current) setRoutines(rows || []);
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [load, auth.isLoaded, auth.user?.id]);
  const complete = async () => {
    if (!active || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const token = await auth.getToken();
      const r = await authedFetch("/api/studio-warmups", token, {
        method: "POST",
        body: JSON.stringify({ projectId, routineId: active.id }),
      });
      if (!r.ok) throw Error("Fullføringen kunne ikke lagres. Prøv igjen.");
      const result = await r.json();
      setRoutines((rows) =>
        rows.map((x) =>
          x.id === active.id
            ? { ...x, completed_at: result.completedAt }
            : x
        )
      );
      setActive(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  const step = active?.steps[index];
  return (
    <View
      style={[
        s.screen,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom },
      ]}
    >
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tilbake fra oppvarming"
          disabled={saving}
          onPress={() => (active ? setActive(null) : router.back())}
          style={s.control}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text accessibilityRole="header" style={s.heading}>
          Fra produsenten
        </Text>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        {!auth.user && auth.isLoaded ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void auth.signIn()}
            style={s.primary}
          >
            <Text style={s.primaryText}>Logg inn for å se oppvarmingen</Text>
          </Pressable>
        ) : loading ? (
          <ActivityIndicator color={Colors.gradientMid} />
        ) : null}
        {!!error && (
          <View style={s.card}>
            <Text accessibilityRole="alert" style={s.text}>
              {error}
            </Text>
            {!active && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setError("");
                  void load()
                    .then((rows) => setRoutines(rows || []))
                    .catch((e) => setError(e.message));
                }}
                style={s.control}
              >
                <Text style={s.text}>Prøv igjen</Text>
              </Pressable>
            )}
          </View>
        )}
        {active && step ? (
          <>
            <Text style={s.eyebrow}>
              {active.session_title || active.title} · {index + 1} /{" "}
              {active.steps.length}
            </Text>
            <Text style={s.title}>{step.title}</Text>
            <Text style={s.text}>
              Anbefalt tid: {Math.ceil(step.durationSec / 60)} min
            </Text>
            <Text style={s.text}>{step.instruction}</Text>
            <WarmupVoicePlayer
              key={active.id + ":" + index}
              exerciseId={step.sourceId}
              customClip={
                step.audioUrl
                  ? {
                      url: step.audioUrl,
                      title: step.title,
                      transcript: step.instruction,
                      kind: step.type.includes("music") ? "music" : "voice",
                    }
                  : undefined
              }
            />
            {!!active.note && <Text style={s.note}>{active.note}</Text>}
            {index + 1 < active.steps.length ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Neste steg i oppvarmingen"
                onPress={() => setIndex((i) => i + 1)}
                style={s.primary}
              >
                <Text style={s.primaryText}>Neste steg</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={() => void complete()}
                style={s.primary}
              >
                <Text style={s.primaryText}>
                  {saving ? "Lagrer…" : "Marker oppvarmingen som fullført"}
                </Text>
              </Pressable>
            )}
            <Text style={s.small}>
              Du bekrefter selv at du har gjennomført rutinen. Appen vurderer
              ikke om stemmen er klar.
            </Text>
          </>
        ) : !loading && auth.user ? (
          <>
            <Text style={s.title}>Oppvarming til studioøkten</Text>
            <Text style={s.text}>
              Rutiner, egen stemme og musikk som produsenten har delt med deg.
            </Text>
            {!routines.length && !error && (
              <Text style={s.text}>Ingen oppvarming er tilordnet ennå.</Text>
            )}
            {routines.map((r) => (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                accessibilityLabel={`Åpne oppvarming ${r.title}`}
                onPress={() => {
                  setActive(r);
                  setIndex(0);
                  setError("");
                }}
                style={s.card}
              >
                <Text style={s.cardTitle}>{r.title}</Text>
                {!!r.session_title && (
                  <Text style={s.text}>{r.session_title}</Text>
                )}
                {!!r.session_start_at && (
                  <Text style={s.small}>
                    {new Date(r.session_start_at).toLocaleString("nb-NO")}
                  </Text>
                )}
                <Text style={s.small}>
                  {r.steps.length} steg
                  {r.completed_at ? " · Fullført" : " · Ikke fullført"}
                </Text>
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 8,
  },
  control: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  heading: { fontSize: 18, color: Colors.textPrimary, fontWeight: "600" },
  content: {
    padding: 20,
    gap: 16,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  title: { fontSize: 27, fontWeight: "700", color: Colors.textPrimary },
  eyebrow: { fontSize: 13, color: Colors.gradientMid },
  text: { fontSize: 15, lineHeight: 23, color: Colors.textSecondary },
  small: { fontSize: 13, lineHeight: 20, color: Colors.textTertiary },
  card: {
    padding: 16,
    gap: 7,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  cardTitle: { fontSize: 17, fontWeight: "600", color: Colors.textPrimary },
  primary: {
    minHeight: 48,
    backgroundColor: Colors.gradientStart,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
  },
  primaryText: { fontSize: 15, fontWeight: "600", color: Colors.background },
  note: {
    fontSize: 15,
    lineHeight: 23,
    color: Colors.textPrimary,
    padding: 14,
    backgroundColor: Colors.surface,
    borderRadius: 12,
  },
});
