import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/creatorhub-auth";
import { authedFetch } from "@/lib/authed-fetch";

type Package = {
  id: string;
  name: string;
  totalSessions: number;
  remainingSessions: number;
  priceMinor: number;
};
type Session = {
  id: string;
  title: string;
  start_at: string;
  location: string | null;
  online_url: string | null;
  price_minor: number | null;
  completed_at: string | null;
};
type Overview = { packages: Package[]; sessions: Session[] };
const safeMeeting = (value: string | null) => {
  try {
    const u = new URL(value || "");
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
};
/** Balance is read from Sound Room, never decremented or cached as a second ledger. */
export function StudioBookingsCard({
  projectId,
  compact = false,
  language,
  disabled = false,
}: {
  projectId: string;
  compact?: boolean;
  language?: "no" | "en";
  disabled?: boolean;
}) {
  const auth = useAuth();
  const en = language
    ? language === "en"
    : !/^n[bon](?:-|$)/i.test(Intl.DateTimeFormat().resolvedOptions().locale);
  const t = (no: string, eng: string) => (en ? eng : no);
  const [data, setData] = useState<Overview | null>(null),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false);
  const [expanded, setExpanded] = useState(!compact);
  const requestBusy = useRef(false);
  const identity = `${projectId}:${auth.user?.id || ""}`;
  const activeIdentity = useRef(identity);
  activeIdentity.current = identity;
  const load = useCallback(async () => {
    try {
      const response = await authedFetch(
        `/api/studio-bookings?projectId=${encodeURIComponent(projectId)}`,
        await auth.getToken()
      );
      if (!response.ok) {
        if (
          [401, 403, 404].includes(response.status) &&
          activeIdentity.current === identity
        )
          setData(null);
        throw new Error("studio_unavailable");
      }
      const result = await response.json();
      if (activeIdentity.current === identity) {
        setData(result);
        setError(false);
      }
    } catch {
      if (activeIdentity.current === identity) setError(true);
    }
  }, [projectId, identity, auth.getToken]);
  useEffect(() => {
    setData(null);
    setError(false);
    setSent(false);
    void load();
    const interval = setInterval(() => {
      if (AppState.currentState === "active") void load();
    }, 30000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => {
      clearInterval(interval);
      listener.remove();
    };
  }, [load]);
  const contact = async () => {
    if (requestBusy.current || disabled) return;
    requestBusy.current = true;
    setBusy(true);
    try {
      const r = await authedFetch(
        "/api/studio-bookings",
        await auth.getToken(),
        {
          method: "POST",
          body: JSON.stringify({ projectId, language: en ? "en" : "no" }),
        }
      );
      if (!r.ok) throw new Error("request_failed");
      setSent(true);
      setError(false);
    } catch {
      setError(true);
    } finally {
      requestBusy.current = false;
      setBusy(false);
    }
  };
  const total =
    data?.packages.reduce((n, p) => n + p.remainingSessions, 0) || 0;
  const next = data?.sessions
    .filter((s) => !s.completed_at && Date.parse(s.start_at) > Date.now())
    .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at))[0];
  if (data && !data.packages.length && !data.sessions.length) return null;
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(
          "Vis studioøkter og pakker",
          "Show studio bookings and packages"
        )}
        disabled={disabled}
        accessibilityState={{ expanded, disabled }}
        onPress={() => setExpanded(!expanded)}
        style={styles.heading}
      >
        <Ionicons
          name="calendar-outline"
          size={21}
          color={Colors.gradientMid}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>
            {t("Studioøkter og pakke", "Studio sessions & package")}
          </Text>
          {data?.packages.length ? (
            <Text accessibilityLiveRegion="polite" style={styles.body}>
              {t(
                `${total} studioøkt${total === 1 ? "" : "er"} igjen`,
                `${total} studio session${total === 1 ? "" : "s"} remaining`
              )}
            </Text>
          ) : null}
          {error ? (
            <Text style={styles.hint}>
              {t("Saldo kunne ikke oppdateres", "Balance could not be updated")}
            </Text>
          ) : null}
          {next ? (
            <Text style={styles.hint}>
              {next.title} ·{" "}
              {new Date(next.start_at).toLocaleString(en ? "en-GB" : "nb-NO", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          ) : null}
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={Colors.textSecondary}
        />
      </Pressable>
      {expanded ? (
        <View style={{ gap: 12, marginTop: 12 }}>
          {!data && !error ? (
            <ActivityIndicator
              accessibilityLabel={t(
                "Laster studioøkter",
                "Loading studio sessions"
              )}
              color={Colors.gradientMid}
            />
          ) : null}
          {error ? (
            <View accessibilityLiveRegion="polite">
              <Text accessibilityRole="alert" style={styles.hint}>
                {t(
                  "Kunne ikke oppdatere studioøktene. Siste viste saldo kan være utdatert.",
                  "Could not update studio sessions. The last displayed balance may be out of date."
                )}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void load()}
                style={styles.action}
              >
                <Text style={styles.actionText}>
                  {t("Prøv igjen", "Try again")}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {data?.packages.map((p) => (
            <View key={p.id} style={styles.row}>
              <Text style={styles.title}>{p.name}</Text>
              <Text style={styles.body}>
                {t(
                  `${p.remainingSessions} av ${p.totalSessions} studioøkt${
                    p.totalSessions === 1 ? "" : "er"
                  } igjen`,
                  `${p.remainingSessions} of ${p.totalSessions} studio session${
                    p.totalSessions === 1 ? "" : "s"
                  } remaining`
                )}
              </Text>
              <Text style={styles.hint}>
                {t("Avtalt pakkepris", "Agreed package price")}:{" "}
                {new Intl.NumberFormat(en ? "en-GB" : "nb-NO", {
                  style: "currency",
                  currency: "NOK",
                }).format(p.priceMinor / 100)}
              </Text>
            </View>
          ))}
          {data?.sessions.map((s) => (
            <View key={s.id} style={styles.row}>
              <Text style={styles.title}>{s.title}</Text>
              <Text style={styles.body}>
                {new Date(s.start_at).toLocaleString(en ? "en-GB" : "nb-NO")}
              </Text>
              {s.location ? (
                <Text style={styles.hint}>{s.location}</Text>
              ) : null}
              {s.price_minor != null ? (
                <Text style={styles.hint}>
                  {t("Avtalt øktpris", "Agreed session price")}:{" "}
                  {new Intl.NumberFormat(en ? "en-GB" : "nb-NO", {
                    style: "currency",
                    currency: "NOK",
                  }).format(s.price_minor / 100)}
                </Text>
              ) : null}
              {s.completed_at ? (
                <Text style={styles.hint}>{t("Gjennomført", "Completed")}</Text>
              ) : safeMeeting(s.online_url) ? (
                <Pressable
                  disabled={disabled}
                  accessibilityState={{ disabled }}
                  accessibilityRole="link"
                  onPress={() =>
                    void Linking.openURL(safeMeeting(s.online_url)!)
                  }
                  style={styles.action}
                >
                  <Text style={styles.actionText}>
                    {t("Åpne møtelenke", "Open meeting link")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ))}
          {data ? (
            <>
              <Text style={styles.hint}>
                {t(
                  "Kun gjennomførte studioøkter teller. Opptak og miksversjoner bruker ingen ekstra økter.",
                  "Only completed studio bookings count. Recordings and mix versions use no extra sessions."
                )}
              </Text>
              {sent ? (
                <Text accessibilityRole="alert" style={styles.body}>
                  {t(
                    "Produsenten har fått forespørselen om flere økter.",
                    "Your producer has received your request for more sessions."
                  )}
                </Text>
              ) : (
                <Pressable
                  disabled={busy || disabled}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy || disabled }}
                  onPress={() => void contact()}
                  style={styles.action}
                >
                  <Text style={styles.actionText}>
                    {busy
                      ? t("Sender…", "Sending…")
                      : t(
                          "Kontakt produsenten om flere økter",
                          "Contact producer about more sessions"
                        )}
                  </Text>
                </Pressable>
              )}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#171922",
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    marginBottom: 12,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
  },
  row: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 4,
  },
  title: { color: Colors.textPrimary, fontSize: 15, fontWeight: "700" },
  body: { color: Colors.textPrimary, fontSize: 14, lineHeight: 21 },
  hint: { color: Colors.textSecondary, fontSize: 12, lineHeight: 19 },
  action: {
    padding: 12,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: "#33241d",
  },
  actionText: { color: Colors.gradientMid, fontSize: 14, fontWeight: "600" },
});
