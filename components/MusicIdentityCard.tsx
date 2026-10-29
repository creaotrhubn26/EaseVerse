import { FontAwesome } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/creatorhub-auth";
import { authedFetch } from "@/lib/authed-fetch";
type Artist = { id: string; spotifyId?: string; name: string; url: string };
type Track = {
  id: string;
  name: string;
  url: string;
  image: string | null;
  artists: Artist[];
};
type Identity = {
  revision: number;
  track: Track | null;
  artists: Artist[];
  issues: string[];
  status: string;
  portfolioVisible: boolean;
};
type Data = { identity: Identity; library: Artist[]; canEdit: boolean };
export function MusicIdentityCard({ projectId }: { projectId: string }) {
  const auth = useAuth();
  const scope = `${projectId}:${auth.user?.id || ""}`;
  return <MusicIdentitySession key={scope} projectId={projectId} />;
}
function MusicIdentitySession({ projectId }: { projectId: string }) {
  const auth = useAuth(),
    alive = useRef(true),
    pending = useRef(false);
  const en = !/^n[bon](?:-|$)/i.test(
    Intl.DateTimeFormat().resolvedOptions().locale
  );
  const t = (no: string, eng: string) => (en ? eng : no);
  const [data, setData] = useState<Data | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState("");
  const [reference, setReference] = useState(""),
    [preview, setPreview] = useState<Track | null>(null),
    [artistLink, setArtistLink] = useState(""),
    [selected, setSelected] = useState<string[]>([]);
  const request = async (
    action = "read",
    payload: Record<string, unknown> = {}
  ) => {
    const response = await authedFetch(
      action === "read"
        ? `/api/music-identity?projectId=${encodeURIComponent(projectId)}`
        : "/api/music-identity",
      await auth.getToken(),
      action === "read"
        ? {}
        : {
            method: "POST",
            body: JSON.stringify({
              projectId,
              action,
              revision: data?.identity.revision,
              ...payload,
            }),
          }
    );
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  };
  const accept = (r: Data) => {
    if (alive.current) {
      setData(r);
      setSelected(r.identity.artists.map((a) => a.spotifyId || a.id));
    }
  };
  const load = async () => {
    try {
      accept(await request());
    } catch {
      if (alive.current)
        setError(
          t(
            "Kunne ikke hente musikkoblingen. Prøv igjen.",
            "Could not load music identity. Try again."
          )
        );
    }
  };
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [projectId]);
  async function run(action: string, payload: Record<string, unknown> = {}) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await request(action, payload);
      if (alive.current) {
        if (action === "preview") setPreview(r.track);
        else {
          accept(r);
          setPreview(null);
          setArtistLink("");
          setNotice(t("Koblingen er lagret.", "Link saved."));
        }
      }
    } catch (e) {
      if (alive.current) {
        setError(
          String(e).includes("409")
            ? t(
                "Koblingen er endret eller må kontrolleres. Se gjennom oppdaterte data.",
                "The link changed or needs checking. Review the latest data."
              )
            : t(
                "Kunne ikke lagre. Kontroller lenken og prøv igjen.",
                "Could not save. Check the link and try again."
              )
        );
        if (String(e).includes("409")) await load();
      }
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const button = (label: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy || disabled }}
      disabled={busy || disabled}
      onPress={onPress}
      style={[styles.button, (busy || disabled) && { opacity: 0.5 }]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
  const trackCard = (track: Track) => (
    <View style={{ gap: 8 }}>
      {track.image && (
        <Image
          source={{ uri: track.image }}
          accessibilityLabel={track.name}
          style={{ width: 100, height: 100 }}
          resizeMode="contain"
        />
      )}
      <Text style={styles.title}>{track.name}</Text>
      <Text style={styles.text}>
        {track.artists.map((a) => a.name).join(", ")}
      </Text>
      <FontAwesome name="spotify" size={22} color="#1DB954" />
      {button(t("Åpne i Spotify", "Open in Spotify"), () => {
        void Linking.openURL(track.url);
      })}
    </View>
  );
  const current = data?.identity;
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((v) => !v)}
        style={{ minHeight: 48, justifyContent: "center" }}
      >
        <Text style={styles.title}>
          {t("Låt og artister · Spotify", "Song and artists · Spotify")}
        </Text>
        <Text style={styles.text}>
          {current?.track?.name ||
            t(
              "Felles med SoundRoom og Pro Tools",
              "Shared with SoundRoom and Pro Tools"
            )}{" "}
          {expanded ? "−" : "+"}
        </Text>
      </Pressable>
      {expanded && (
        <View style={{ gap: 14 }}>
          {busy && (
            <Text accessibilityLiveRegion="polite" style={styles.text}>
              {t("Kontrollerer og lagrer…", "Checking and saving…")}
            </Text>
          )}
          {!busy && !!notice && (
            <Text accessibilityLiveRegion="polite" style={styles.text}>
              {notice}
            </Text>
          )}
          {!!error && (
            <Text
              accessibilityRole="alert"
              style={{ color: Colors.dangerUnderline }}
            >
              {error}
            </Text>
          )}
          {!data && button(t("Prøv igjen", "Retry"), load)}
          {current && (
            <>
              {current.track && trackCard(current.track)}
              <Text style={styles.text}>
                {current.status === "checked"
                  ? t("Katalogkobling kontrollert.", "Catalog link checked.")
                  : current.issues.includes("unlinked")
                  ? t(
                      "Koble låten når den er utgitt på Spotify.",
                      "Link the track once it is released on Spotify."
                    )
                  : t(
                      "Kontroller artister, ISRC og Spotify-tilgang før utgivelsen vises offentlig.",
                      "Check artists, ISRC and Spotify availability before displaying the release publicly."
                    )}
              </Text>
              {data?.canEdit ? (
                <>
                  <TextInput
                    accessibilityLabel={t(
                      "Spotify-låtlenke",
                      "Spotify track link"
                    )}
                    placeholder={t(
                      "Lim inn Spotify-låtlenke",
                      "Paste Spotify track link"
                    )}
                    placeholderTextColor={Colors.textTertiary}
                    style={styles.input}
                    value={reference}
                    editable={!busy}
                    autoCapitalize="none"
                    onChangeText={(v) => {
                      setReference(v);
                      setPreview(null);
                    }}
                  />
                  {button(
                    t("Hent låt", "Find track"),
                    () => run("preview", { reference }),
                    !reference.trim()
                  )}
                  {preview && (
                    <View style={{ gap: 12 }}>
                      {trackCard(preview)}
                      {button(
                        t("Bekreft låtkobling", "Confirm track link"),
                        () => run("link", { reference: preview.id })
                      )}
                    </View>
                  )}
                  {current.track && (
                    <>
                      {button(t("Kontroller på nytt", "Check again"), () =>
                        run("refresh")
                      )}
                      {button(
                        t(
                          "Bruk artistene fra låten",
                          "Use the track’s artists"
                        ),
                        () => run("adopt-artists")
                      )}
                    </>
                  )}
                  <Text style={styles.title}>
                    {t("Gjenbruk artistprofiler", "Reuse artist profiles")}
                  </Text>
                  {data.library.map((a) => (
                    <Pressable
                      key={a.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{
                        checked: selected.includes(a.spotifyId || a.id),
                        disabled: busy,
                      }}
                      disabled={busy}
                      onPress={() =>
                        setSelected((ids) =>
                          ids.includes(a.spotifyId || a.id)
                            ? ids.filter((id) => id !== (a.spotifyId || a.id))
                            : [...ids, a.spotifyId || a.id]
                        )
                      }
                      style={styles.button}
                    >
                      <Text style={styles.text}>
                        {selected.includes(a.spotifyId || a.id) ? "✓ " : ""}
                        {a.name}
                      </Text>
                    </Pressable>
                  ))}
                  <TextInput
                    accessibilityLabel={t(
                      "Spotify-artistlenke",
                      "Spotify artist link"
                    )}
                    placeholder={t(
                      "Legg til Spotify-artistlenke",
                      "Add Spotify artist link"
                    )}
                    placeholderTextColor={Colors.textTertiary}
                    value={artistLink}
                    editable={!busy}
                    autoCapitalize="none"
                    onChangeText={setArtistLink}
                    style={styles.input}
                  />
                  {button(t("Lagre artister", "Save artists"), () =>
                    run("artists", {
                      artistIds: [
                        ...selected,
                        ...(artistLink.trim() ? [artistLink.trim()] : []),
                      ],
                    })
                  )}
                  {button(
                    current.portfolioVisible
                      ? t("Skjul fra landingssiden", "Hide from landing page")
                      : t(
                          "Vis utgivelsen på landingssiden",
                          "Show release on landing page"
                        ),
                    () =>
                      run("portfolio", { visible: !current.portfolioVisible }),
                    !current.portfolioVisible && !!current.issues.length
                  )}
                  <Text style={styles.text}>
                    {t(
                      "Bare kataloginformasjon blir offentlig. Roller, kreditering og private opptak beholdes.",
                      "Only catalog information becomes public. Roles, credits and private recordings stay unchanged."
                    )}
                  </Text>
                  {current.track &&
                    button(t("Fjern låtkobling", "Remove track link"), () =>
                      run("unlink")
                    )}
                </>
              ) : (
                <Text style={styles.text}>
                  {t(
                    "Prosjekteieren kan endre koblingen.",
                    "The project owner can edit this link."
                  )}
                </Text>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    marginVertical: 8,
  },
  title: { fontSize: 16, fontWeight: "700", color: Colors.textPrimary },
  text: { fontSize: 14, lineHeight: 21, color: Colors.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: 10,
    color: Colors.textPrimary,
    padding: 12,
    minHeight: 48,
  },
  button: {
    minHeight: 48,
    padding: 12,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    borderRadius: 10,
  },
  buttonText: { color: Colors.gradientMid, fontWeight: "600", fontSize: 14 },
});
