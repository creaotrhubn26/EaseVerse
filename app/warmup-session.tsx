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
import {
  WarmupSoundscape,
  useWarmupSoundscape,
} from "@/components/WarmupSoundscape";
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
  const { isLoaded, user, getToken, signIn } = useAuth();
  const userId = user?.id;
  const insets = useSafeAreaInsets();
  const { stopSoundscape } = useWarmupSoundscape();
  const [routines, setRoutines] = useState<Routine[]>([]),
    [active, setActive] = useState<Routine | null>(null),
    [index, setIndex] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const busy = useRef(false);
  useEffect(() => () => stopSoundscape(), [active?.id, stopSoundscape]);
  const load = useCallback(async () => {
    if (!projectId) return;
    const token = await getToken();
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
  }, [projectId, getToken]);
  useEffect(() => {
    let current = true;
    setRoutines([]);
    setActive(null);
    setError("");
    setLoading(true);
    if (!isLoaded || !userId)
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
  }, [load, isLoaded, userId]);
  const complete = async () => {
    if (!active || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const token = await getToken();
      const r = await authedFetch("/api/studio-warmups", token, {
        method: "POST",
        body: JSON.stringify({ projectId, routineId: active.id }),
      });
      if (!r.ok) throw Error("Fullføringen kunne ikke lagres. Prøv igjen.");
      const result = await r.json();
      setRoutines((rows) =>
        rows.map((x) =>
          x.id === active.id ? { ...x, completed_at: result.completedAt } : x
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
    <View style={[s.screen, { paddingTop: insets.top + 8 }]}>
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tilbake fra oppvarming"
          disabled={saving}
          onPress={() => (active ? setActive(null) : router.back())}
          style={s.control}
        >
          <Ionicons name="arrow-back" size={23} color={Colors.textPrimary} />
        </Pressable>
        <View style={s.headerCopy}>
          <Text accessibilityRole="header" style={s.heading}>
            Oppvarming
          </Text>
          <Text style={s.headerSubtitle}>Fra produsenten</Text>
        </View>
        {active && (
          <Text
            accessibilityLabel={`Steg ${index + 1} av ${active.steps.length}`}
            style={s.stepCount}
          >
            {index + 1} av {active.steps.length}
          </Text>
        )}
      </View>
      <ScrollView contentContainerStyle={s.content}>
        {!userId && isLoaded ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void signIn()}
            style={s.primary}
          >
            <Text style={s.primaryText}>Logg inn for å se oppvarmingen</Text>
          </Pressable>
        ) : loading ? (
          <ActivityIndicator color={Colors.gradientMid} />
        ) : null}
        {!!error && !active && (
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
            <View
              style={s.stepProgress}
              accessibilityRole="progressbar"
              accessibilityLabel="Steg i oppvarmingen"
              aria-valuemin={1}
              aria-valuemax={active.steps.length}
              aria-valuenow={index + 1}
              accessibilityValue={{
                min: 1,
                max: active.steps.length,
                now: index + 1,
              }}
            >
              {active.steps.map((_, i) => (
                <View
                  key={i}
                  style={[s.stepSegment, i <= index && s.currentSegment]}
                />
              ))}
            </View>
            <View style={s.exerciseHeading}>
              <Text style={s.eyebrow}>
                {active.session_title || active.title}
              </Text>
              <Text accessibilityRole="header" style={s.title}>
                {step.title}
              </Text>
              <View style={s.duration}>
                <Ionicons
                  name="time-outline"
                  size={16}
                  color={Colors.textTertiary}
                />
                <Text style={s.small}>
                  Sett av omtrent{" "}
                  {Math.max(1, Math.ceil(step.durationSec / 60))} min
                </Text>
              </View>
            </View>
            <View style={s.instruction}>
              <Text style={s.instructionLabel}>Slik gjør du</Text>
              <Text style={s.instructionText}>{step.instruction}</Text>
            </View>
            <WarmupVoicePlayer
              key={active.id + ":" + index}
              exerciseId={step.sourceId}
              showTranscript={!step.audioUrl}
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
          </>
        ) : !loading && userId ? (
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
                <View style={s.routineHeader}>
                  <View style={s.routineIcon}>
                    <Ionicons
                      name={r.completed_at ? "checkmark" : "mic-outline"}
                      size={22}
                      color={Colors.gradientMid}
                    />
                  </View>
                  <Text style={s.cardTitle}>{r.title}</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={Colors.textTertiary}
                  />
                </View>
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
      {active && step && (
        <View
          style={[s.footer, { paddingBottom: Math.max(16, insets.bottom) }]}
        >
          <View style={s.footerInner}>
            {!!error && (
              <Text accessibilityRole="alert" style={s.saveError}>
                {error}
              </Text>
            )}
            <View style={s.footerActions}>
              {index > 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Forrige steg i oppvarmingen"
                  disabled={saving}
                  onPress={() => setIndex((i) => i - 1)}
                  style={s.previous}
                >
                  <Ionicons
                    name="arrow-back"
                    size={20}
                    color={Colors.textPrimary}
                  />
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  index + 1 < active.steps.length
                    ? "Neste steg i oppvarmingen"
                    : "Marker oppvarmingen som fullført"
                }
                disabled={saving}
                onPress={() =>
                  index + 1 < active.steps.length
                    ? setIndex((i) => i + 1)
                    : void complete()
                }
                style={({ pressed }) => [
                  s.primary,
                  s.footerPrimary,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={s.primaryText}>
                  {saving
                    ? "Lagrer…"
                    : index + 1 < active.steps.length
                    ? "Neste øvelse"
                    : "Fullfør oppvarming"}
                </Text>
                <Ionicons
                  name={
                    index + 1 < active.steps.length
                      ? "arrow-forward"
                      : "checkmark"
                  }
                  size={20}
                  color={Colors.background}
                />
              </Pressable>
            </View>
            <Text style={s.footerHint}>
              {index + 1 < active.steps.length
                ? "Ta den tiden du trenger."
                : "Du bekrefter selv at du har gjennomført."}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderGlass,
  },
  headerCopy: { flex: 1, gap: 3 },
  control: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
  },
  heading: { fontSize: 16, color: Colors.textPrimary, fontWeight: "600" },
  headerSubtitle: { fontSize: 12, color: Colors.textTertiary },
  stepCount: {
    color: Colors.textSecondary,
    fontSize: 13,
    paddingHorizontal: 8,
  },
  content: {
    padding: 20,
    paddingTop: 24,
    paddingBottom: 28,
    gap: 22,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  stepProgress: { flexDirection: "row", gap: 5 },
  stepSegment: {
    flex: 1,
    height: 3,
    backgroundColor: Colors.borderGlass,
    borderRadius: 2,
  },
  currentSegment: { backgroundColor: Colors.gradientMid },
  exerciseHeading: { gap: 10 },
  title: {
    fontSize: 30,
    lineHeight: 37,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.gradientMid,
    fontWeight: "600",
  },
  duration: { flexDirection: "row", alignItems: "center", gap: 6 },
  text: { fontSize: 15, lineHeight: 23, color: Colors.textSecondary },
  small: { fontSize: 13, lineHeight: 20, color: Colors.textTertiary },
  instruction: {
    gap: 8,
    paddingLeft: 14,
    borderLeftWidth: 2,
    borderLeftColor: Colors.accentBorder,
  },
  instructionLabel: {
    fontSize: 12,
    color: Colors.textTertiary,
    fontWeight: "600",
  },
  instructionText: { fontSize: 17, lineHeight: 27, color: Colors.textPrimary },
  card: {
    padding: 18,
    gap: 10,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  routineHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  routineIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Colors.accentSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    flex: 1,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderGlass,
    backgroundColor: Colors.background,
    paddingTop: 16,
    paddingHorizontal: 20,
  },
  footerInner: { width: "100%", maxWidth: 520, alignSelf: "center", gap: 10 },
  footerActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  previous: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    justifyContent: "center",
    alignItems: "center",
  },
  primary: {
    minHeight: 50,
    backgroundColor: Colors.gradientStart,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  footerPrimary: { flex: 1 },
  primaryText: { fontSize: 15, fontWeight: "600", color: Colors.background },
  footerHint: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    color: Colors.textTertiary,
  },
  saveError: { color: Colors.textPrimary, fontSize: 13, lineHeight: 20 },
  note: {
    fontSize: 15,
    lineHeight: 23,
    color: Colors.textPrimary,
    padding: 16,
    backgroundColor: Colors.surfaceGlass,
    borderRadius: 14,
  },
});
