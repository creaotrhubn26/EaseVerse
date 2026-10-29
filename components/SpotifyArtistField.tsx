import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Colors from "@/constants/colors";
import { FontAwesome } from "@expo/vector-icons";
import { authedFetch } from "@/lib/authed-fetch";

type Artist = { id: string; name: string; url: string; image: string | null };
export default function SpotifyArtistField({
  value,
  onChange,
  inviteToken,
  getToken,
  en,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  inviteToken: string;
  getToken: () => Promise<string | null>;
  en: boolean;
  disabled?: boolean;
}) {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [resolved, setResolved] = useState<{
    value: string;
    artist: Artist;
  } | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const t = (no: string, english: string) => (en ? english : no);
  useEffect(() => {
    const abort = new AbortController();
    setArtists([]);
    setResolved(null);
    setError("");
    setLoading(false);
    if (!value.trim()) return;
    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const r = await authedFetch(
            "/api/sound-room/spotify-artist",
            await getToken(),
            {
              method: "POST",
              signal: abort.signal,
              body: JSON.stringify({ inviteToken, query: value.trim() }),
            },
          );
          if (!r.ok) throw new Error(String(r.status));
          const d = await r.json();
          if (abort.signal.aborted) return;
          if (d.resolved && d.artists?.[0])
            setResolved({ value, artist: d.artists[0] });
          else setArtists(d.artists || []);
        } catch (e) {
          if (!abort.signal.aborted)
            setError(e instanceof Error ? e.message : "503");
        } finally {
          if (!abort.signal.aborted) setLoading(false);
        }
      })();
    }, 350);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [value, inviteToken, getToken, retry]);
  const artist = resolved?.value === value ? resolved.artist : null;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {t("Spotify-artist (valgfritt)", "Spotify artist (optional)")}
      </Text>
      <TextInput
        accessibilityLabel="Spotify artist"
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        autoCorrect={false}
        autoCapitalize="none"
        maxLength={120}
        style={styles.input}
        placeholder={t(
          "Artistnavn eller Spotify-artistlenke",
          "Artist name or Spotify artist link",
        )}
        placeholderTextColor={Colors.textTertiary}
      />
      {loading && (
        <ActivityIndicator
          accessibilityLabel={t("Kontrollerer Spotify", "Checking Spotify")}
        />
      )}
      {error ? (
        <>
          <Text accessibilityRole="alert" style={styles.error}>
            {error === "400"
              ? t(
                  "Bruk en artistlenke fra Spotify. Låter og album kan ikke brukes her.",
                  "Use a Spotify artist link, not a track or album link.",
                )
              : t(
                  "Spotify kunne ikke kontrolleres nå. Lagret kobling beholdes.",
                  "Could not check Spotify now. Your saved link is preserved.",
                )}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => setRetry((r) => r + 1)}
            style={styles.row}
          >
            <Text style={styles.label}>{t("Prøv igjen", "Try again")}</Text>
          </Pressable>
        </>
      ) : null}
      {artist ? (
        <>
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              void Linking.openURL(artist.url).catch(() => setError("open"));
            }}
            style={styles.row}
          >
            {artist.image && (
              <Image
                source={{ uri: artist.image }}
                style={styles.image}
                resizeMode="contain"
              />
            )}
            <FontAwesome name="spotify" size={20} color="#1DB954" />
            <Text style={styles.label}>{artist.name} · Spotify ↗</Text>
          </Pressable>
          <Text style={styles.hint}>
            {t(
              "Artistprofil kontrollert. Dette bekrefter ikke eierskap til profilen.",
              "Artist profile checked. This does not verify ownership of the profile.",
            )}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.hint}>
            {t(
              "Velg riktig artist fra treffene. Spotify er valgfritt.",
              "Choose the correct artist from the results. Spotify is optional.",
            )}
          </Text>
          {artists.map((a) => (
            <Pressable
              key={a.id}
              accessibilityRole="button"
              accessibilityLabel={`${t("Velg", "Select")} ${a.name}, ${a.id}`}
              disabled={disabled}
              onPress={() => onChange(a.url)}
              style={styles.row}
            >
              {a.image && (
                <Image
                  source={{ uri: a.image }}
                  style={styles.image}
                  resizeMode="contain"
                />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{a.name}</Text>
                <Text style={styles.hint}>Spotify · {a.id}</Text>
              </View>
            </Pressable>
          ))}
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  field: { gap: 8 },
  label: { color: Colors.textPrimary, fontSize: 14 },
  hint: { color: Colors.textSecondary, fontSize: 12 },
  input: {
    minHeight: 48,
    padding: 12,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: 12,
    fontSize: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    minHeight: 48,
    backgroundColor: Colors.surface,
    borderRadius: 8,
  },
  image: { width: 48, height: 48 },
  error: { color: Colors.dangerUnderline, fontSize: 14 },
});
