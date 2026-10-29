import SpotifyArtistField from "@/components/SpotifyArtistField";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/creatorhub-auth";
import { useApp } from "@/lib/AppContext";
import { authedFetch } from "@/lib/authed-fetch";

type Profile = {
  name: string;
  role: string;
  instrument: string;
  email: string;
  phone: string;
  bio: string;
  avatarUrl: string;
  links: Record<string, string>;
  contributions: string[];
  completed: boolean;
};
type Invite = {
  projectTitle: string;
  profile: Profile;
  easeverseAccess: boolean;
  linked?: { projectId: string; trackId: string | null } | null;
  completed?: boolean;
};
const validToken = (token: string) => /^inv_[A-Za-z0-9_-]{16,76}$/.test(token);
export default function SoundRoomInvitation() {
  const params = useLocalSearchParams<{ token: string }>();
  const token = Array.isArray(params.token)
    ? params.token[0]
    : params.token || "";
  const auth = useAuth();
  const { isLoaded, isSignedIn, getToken } = auth;
  const { settings } = useApp();
  const insets = useSafeAreaInsets();
  const [en, setEn] = useState(
    !/norsk|norwegian|^no$|^nb$/i.test(settings.language)
  );
  const t = (no: string, english: string) => (en ? english : no);
  const [invite, setInvite] = useState<Invite | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [attempt, setAttempt] = useState(0);
  const savingRef = useRef(false);
  const identity = `${token}:${auth.user?.id || ""}`;
  const active = useRef(identity);
  active.current = identity;
  const path = `/sound-room/invite/${token}`;
  useEffect(() => {
    setInvite(null);
    setProfile(null);
    setDone(false);
    setError("");
    setLoading(false);
    if (!isLoaded || !isSignedIn || !validToken(token)) return;
    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const response = await authedFetch(
          "/api/sound-room/invitation",
          await getToken(),
          {
            method: "POST",
            signal: controller.signal,
            body: JSON.stringify({ action: "lookup", inviteToken: token }),
          }
        );
        if (!response.ok)
          throw new Error(response.status === 404 ? "unavailable" : "load");
        const data = (await response.json()) as Invite;
        if (controller.signal.aborted) return;
        setInvite(data);
        setProfile(data.profile);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error && e.message === "unavailable"
              ? "unavailable"
              : "load"
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [identity, isLoaded, isSignedIn, getToken, attempt, token]);
  const login = async () => {
    setError("");
    try {
      const ok = await auth.signIn(path);
      if (ok && Platform.OS !== "web") router.replace(path as never);
    } catch {
      setError("login");
    }
  };
  const set = (key: keyof Profile, value: unknown) =>
    setProfile((p) => (p ? { ...p, [key]: value } : p));
  const photo = async () => {
    try {
      const selected = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
      if (selected.canceled) return;
      const asset = selected.assets[0];
      if (!asset.base64 || asset.base64.length > 2_800_000) {
        setError("photo");
        return;
      }
      set(
        "avatarUrl",
        `data:${
          ["image/png", "image/jpeg", "image/webp"].includes(
            asset.mimeType || ""
          )
            ? asset.mimeType
            : "image/jpeg"
        };base64,${asset.base64}`
      );
      setError("");
    } catch {
      setError("photo");
    }
  };
  const save = async () => {
    if (!profile?.name.trim() || savingRef.current) return;
    const who = identity;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await authedFetch(
        "/api/sound-room/invitation",
        await getToken(),
        {
          method: "POST",
          body: JSON.stringify({
            action: "complete",
            inviteToken: token,
            profile,
          }),
        }
      );
      if (!response.ok)
        throw new Error(response.status === 404 ? "unavailable" : response.status === 400 ? "spotify" : "save");
      const data = (await response.json()) as Invite;
      if (active.current !== who) return;
      setInvite(data);
      setDone(true);
    } catch (e) {
      if (active.current === who)
        setError(
          e instanceof Error && ["unavailable", "spotify"].includes(e.message)
            ? e.message
            : "save"
        );
    } finally {
      savingRef.current = false;
      if (active.current === who) setSaving(false);
    }
  };
  const errorText =
    error === "unavailable"
      ? t(
          "Invitasjonen er utløpt, trukket tilbake eller sendt til en annen e-postadresse. Logg inn med den inviterte adressen, eller be produsenten om en ny invitasjon.",
          "This invitation has expired, was withdrawn, or belongs to another email address. Sign in with the invited address or ask the producer for a new invitation."
        )
      : error === "photo"
      ? t(
          "Bildet kunne ikke brukes. Velg et mindre JPG- eller PNG-bilde.",
          "Could not use this image. Choose a smaller JPG or PNG image."
        )
      : error === "spotify"
      ? t("Kontroller profilfeltene og velg en gyldig Spotify-artist. Du kan også tømme Spotify-feltet.", "Check your profile fields and select a valid Spotify artist. You can also clear the Spotify field.")
      : error === "save"
      ? t(
          "Profilen kunne ikke lagres. Opplysningene er fortsatt her. Prøv igjen.",
          "Could not save your profile. Your changes are still here. Try again."
        )
      : error === "login"
      ? t(
          "Innloggingen ble ikke fullført. Prøv igjen.",
          "Sign-in did not complete. Try again."
        )
      : t(
          "Invitasjonen kunne ikke lastes akkurat nå. Prøv igjen.",
          "Could not load the invitation right now. Try again."
        );
  const button = (
    label: string,
    onPress: () => void,
    secondary = false,
    disabled = false
  ) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[
        styles.button,
        secondary && styles.secondary,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>
        {label}
      </Text>
    </Pressable>
  );
  const field = (
    label: string,
    key: keyof Profile,
    options: {
      multiline?: boolean;
      keyboardType?: "default" | "phone-pad" | "url";
    } = {}
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={String(profile?.[key] || "")}
        onChangeText={(value) => set(key, value)}
        editable={!saving}
        multiline={options.multiline}
        keyboardType={options.keyboardType || "default"}
        maxLength={key === "bio" ? 2000 : key === "name" ? 200 : 120}
        style={[styles.input, options.multiline && styles.multiline]}
        placeholderTextColor={Colors.textTertiary}
      />
    </View>
  );
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 28 },
        ]}
      >
        <View style={styles.card}>
          <View style={styles.top}>
            <Text style={styles.eyebrow}>EASEVERSE · SOUND ROOM</Text>
            <View style={styles.languages}>
              {button("NO", () => setEn(false), en)}
              {button("EN", () => setEn(true), !en)}
            </View>
          </View>
          <Text style={styles.title}>
            {done
              ? t("Profilen din er lagret", "Your profile is saved")
              : t(
                  "Du er invitert til å samarbeide",
                  "You are invited to collaborate"
                )}
          </Text>
          {invite ? (
            <Text style={styles.project}>{invite.projectTitle}</Text>
          ) : null}
          {Platform.OS === "web" && validToken(token)
            ? button(
                t("Åpne i EaseVerse-appen", "Open in the EaseVerse app"),
                () => {
                  void Linking.openURL(
                    `easeverse://sound-room/invite/${token}`
                  ).catch(() => setError("login"));
                },
                true
              )
            : null}
          {!validToken(token) ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {t(
                "Invitasjonslenken er ugyldig.",
                "This invitation link is invalid."
              )}
            </Text>
          ) : (
            <>
              {!auth.isLoaded || loading ? (
                <ActivityIndicator
                  accessibilityLabel={t(
                    "Laster invitasjonen",
                    "Loading invitation"
                  )}
                  color={Colors.gradientMid}
                />
              ) : null}
              {auth.isLoaded && !auth.isSignedIn ? (
                <>
                  <Text style={styles.body}>
                    {t(
                      "Logg inn med e-postadressen invitasjonen ble sendt til. Deretter fyller du ut profilen her i appen.",
                      "Sign in with the email address that received the invitation. Then complete your profile here in the app."
                    )}
                  </Text>
                  {button(
                    auth.isSigningIn
                      ? t("Åpner innlogging…", "Opening sign-in…")
                      : t(
                          "Fortsett med CreatorHub",
                          "Continue with CreatorHub"
                        ),
                    () => void login(),
                    false,
                    auth.isSigningIn
                  )}
                </>
              ) : null}
              {error ? (
                <View accessibilityRole="alert" style={styles.notice}>
                  <Text style={styles.error}>{errorText}</Text>
                  {error === "load"
                    ? button(
                        t("Prøv igjen", "Try again"),
                        () => setAttempt((a) => a + 1),
                        true
                      )
                    : null}
                </View>
              ) : null}
              {auth.isSignedIn ? (
                <>
                  <Text style={styles.account}>
                    {t("Innlogget som", "Signed in as")} {auth.user?.email}
                  </Text>
                  {error === "unavailable"
                    ? button(
                        t("Bytt konto", "Switch account"),
                        () => {
                          void auth.signOut();
                        },
                        true
                      )
                    : null}
                </>
              ) : null}
              {profile && !done ? (
                <>
                  <Text style={styles.body}>
                    {t(
                      "Produsenten ser profilen din i Sound Room. Rolle og tilgang bestemmes av produsenten.",
                      "Your producer sees this profile in Sound Room. Your role and access are set by the producer."
                    )}
                  </Text>
                  <Pressable
                    onPress={() => void photo()}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      "Velg profilbilde",
                      "Choose profile photo"
                    )}
                    style={styles.photo}
                  >
                    {profile.avatarUrl ? (
                      <Image
                        source={{ uri: profile.avatarUrl }}
                        style={styles.avatar}
                      />
                    ) : (
                      <Ionicons
                        name="person-circle-outline"
                        size={80}
                        color={Colors.gradientMid}
                      />
                    )}
                    <Text style={styles.link}>
                      {t("Velg profilbilde", "Choose profile photo")}
                    </Text>
                  </Pressable>
                  <Text style={styles.role}>
                    {t("Din rolle", "Your role")}:{" "}
                    {profile.role || t("Bidragsyter", "Contributor")}
                  </Text>
                  {field(t("Navn", "Name"), "name")}
                  {field(
                    t("Instrument (valgfritt)", "Instrument (optional)"),
                    "instrument"
                  )}
                  <View style={styles.field}>
                    <Text style={styles.label}>
                      {t(
                        "Bidrag – skill med komma",
                        "Contributions – separate with commas"
                      )}
                    </Text>
                    <TextInput
                      accessibilityLabel={t("Bidrag", "Contributions")}
                      value={profile.contributions.join(", ")}
                      editable={!saving}
                      onChangeText={(value) =>
                        set(
                          "contributions",
                          value.split(",").map((v) => v.trimStart())
                        )
                      }
                      style={styles.input}
                    />
                  </View>
                  <Text style={styles.account}>
                    {t("Invitert e-post", "Invited email")}: {profile.email}
                  </Text>
                  {field(
                    t("Telefon (valgfritt)", "Phone (optional)"),
                    "phone",
                    { keyboardType: "phone-pad" }
                  )}
                  {field(
                    t("Kort om deg (valgfritt)", "About you (optional)"),
                    "bio",
                    { multiline: true }
                  )}
                  <Text style={styles.section}>
                    {t(
                      "Sosiale kontoer (valgfritt)",
                      "Social accounts (optional)"
                    )}
                  </Text>
                  <SpotifyArtistField value={profile.links.spotify || ""} onChange={(value) => set("links", { ...profile.links, spotify: value })} inviteToken={token} getToken={getToken} en={en} disabled={saving} />
                  {["instagram", "tiktok", "youtube"].map((key) => (
                    <View style={styles.field} key={key}>
                      <Text style={styles.label}>
                        {key === "tiktok"
                          ? "TikTok"
                          : key.charAt(0).toUpperCase() + key.slice(1)}
                      </Text>
                      <TextInput
                        accessibilityLabel={key}
                        autoCapitalize="none"
                        autoCorrect={false}
                        maxLength={600}
                        editable={!saving}
                        value={profile.links[key] || ""}
                        onChangeText={(value) =>
                          set("links", { ...profile.links, [key]: value })
                        }
                        style={styles.input}
                      />
                    </View>
                  ))}
                  {button(
                    saving
                      ? t("Lagrer…", "Saving…")
                      : t(
                          "Lagre profil og fortsett",
                          "Save profile and continue"
                        ),
                    () => void save(),
                    false,
                    saving || !profile.name.trim()
                  )}
                  <Text style={styles.footnote}>
                    {t(
                      "Opplysningene brukes til å administrere samarbeidet i dette prosjektet. Ingen avtaler signeres eller betalinger gjennomføres her.",
                      "These details are used to manage this project collaboration. No agreements are signed and no payments are made here."
                    )}
                  </Text>
                </>
              ) : null}
              {done ? (
                <>
                  <Ionicons
                    name="checkmark-circle"
                    size={48}
                    color={Colors.successUnderline}
                  />
                  <Text accessibilityLiveRegion="polite" style={styles.body}>
                    {t(
                      "Produsenten kan nå se opplysningene dine i Sound Room.",
                      "Your producer can now see your details in Sound Room."
                    )}
                  </Text>
                  {invite?.linked ? (
                    button(t("Åpne prosjektet", "Open project"), () =>
                      router.replace({
                        pathname: "/projects/[id]",
                        params: { id: invite.linked!.projectId },
                      })
                    )
                  ) : (
                    <>
                      <Text style={styles.body}>
                        {t(
                          "Prosjektet er ikke aktivert for deg i EaseVerse ennå. Produsenten kan aktivere tilgangen fra Sound Room.",
                          "This project is not enabled for you in EaseVerse yet. Your producer can enable access in Sound Room."
                        )}
                      </Text>
                      {button(t("Til mine prosjekter", "My projects"), () =>
                        router.replace("/projects")
                      )}
                    </>
                  )}
                </>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 18, alignItems: "center" },
  card: { width: "100%", maxWidth: 540, gap: 18 },
  top: { gap: 12 },
  languages: { flexDirection: "row", gap: 8 },
  eyebrow: {
    color: Colors.gradientMid,
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
  },
  title: {
    color: Colors.textPrimary,
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    lineHeight: 35,
  },
  project: {
    color: Colors.gradientMid,
    fontFamily: "Inter_600SemiBold",
    fontSize: 20,
  },
  body: { color: Colors.textSecondary, fontSize: 15, lineHeight: 23 },
  account: { color: Colors.textSecondary, fontSize: 12, lineHeight: 19 },
  field: { gap: 7 },
  label: {
    color: Colors.textPrimary,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  input: {
    minHeight: 48,
    padding: 12,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
    borderColor: Colors.borderGlass,
    borderWidth: 1,
    borderRadius: 12,
    fontSize: 16,
  },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  button: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.gradientStart,
  },
  buttonText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 },
  secondary: {
    backgroundColor: Colors.surface,
    borderColor: Colors.borderGlass,
    borderWidth: 1,
  },
  secondaryText: { color: Colors.textPrimary },
  disabled: { opacity: 0.5 },
  notice: {
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.dangerUnderline,
    borderRadius: 12,
    padding: 14,
  },
  error: { color: Colors.dangerUnderline, fontSize: 14, lineHeight: 22 },
  photo: { alignItems: "center", gap: 8, padding: 8 },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  link: { color: Colors.gradientMid, fontSize: 14 },
  role: { color: Colors.textSecondary, fontSize: 14 },
  section: {
    color: Colors.textPrimary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
  },
  footnote: { color: Colors.textTertiary, fontSize: 12, lineHeight: 18 },
});
