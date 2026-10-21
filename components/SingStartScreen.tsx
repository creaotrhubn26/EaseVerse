import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";

type Props = {
  onCaptureIdea: () => void;
  onChooseSong: () => void;
  onboarding?: React.ReactNode;
  notices?: React.ReactNode;
};

/** The empty singing workspace is a page, never an overlay over live controls. */
export function SingStartScreen({ onCaptureIdea, onChooseSong, onboarding, notices }: Props) {
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <View style={s.content}>
        <View style={s.brand}>
          <Image source={require("@/assets/images/easeverse_logo.png")} style={s.logo}
            accessibilityLabel="EaseVerse" accessibilityRole="image" resizeMode="contain" />
        </View>
        {notices}
        <View style={s.hero}>
          <View style={s.heroArtwork}><Image source={require("@/assets/images/studio-preparation-amber-v1.jpg")}
            style={s.heroImage} resizeMode="cover" accessible={false} /></View>
          <View style={s.heroCopy}>
            <Text style={s.eyebrow}>YOUR VOCAL SPACE</Text>
            <Text accessibilityRole="header" style={s.title}>Start with your voice.</Text>
            <Text style={s.description}>Save a vocal idea now. You can add lyrics when you’re ready.</Text>
            <Pressable onPress={onCaptureIdea} accessibilityRole="button"
              accessibilityLabel="Capture a quick vocal idea"
              accessibilityHint="Creates a voice memo. Recording starts when you tap Record."
              style={({ pressed }) => [s.primary, pressed && s.pressed]}>
              <Ionicons name="mic-outline" size={22} color={Colors.background} />
              <Text style={s.primaryText}>Capture a vocal idea</Text>
              <Ionicons name="arrow-forward" size={20} color={Colors.background} />
            </Pressable>
            <Text style={s.hint}>No lyrics needed · You control when recording starts</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text accessibilityRole="header" style={s.sectionTitle}>Work on a song</Text>
          <View style={s.songCard}>
            <ActionRow icon="musical-notes-outline" title="Open a song" detail="Continue with lyrics you’ve saved"
              label="Choose existing song" onPress={onChooseSong} />
            <View style={s.divider} />
            <ActionRow icon="create-outline" title="Write lyrics" detail="Start a song or add your words"
              label="Add lyrics" onPress={() => router.push("/(tabs)/lyrics")} />
          </View>
        </View>

        <View style={s.section}>
          <Text accessibilityRole="header" style={s.sectionTitle}>Before you sing</Text>
          <View style={s.shortcuts}>
            <Preparation icon="mic-outline" title="Warm up" detail="Prepare your voice" label="Warm up" onPress={() => router.push("/warmup")} />
            <Preparation icon="leaf-outline" title="Find focus" detail="Breathe and settle in" label="Mindfulness" onPress={() => router.push("/mindfulness")} />
          </View>
        </View>
        {onboarding}
      </View>
    </ScrollView>
  );
}

function ActionRow({icon, title, detail, label, onPress}: {
  icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; detail: string; label: string; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({pressed}) => [s.action, pressed && s.pressed]}>
    <View style={s.icon}><Ionicons name={icon} size={22} color={Colors.gradientMid} /></View>
    <View style={s.actionCopy}><Text style={s.actionTitle}>{title}</Text><Text style={s.detail}>{detail}</Text></View>
    <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
  </Pressable>;
}
function Preparation(props: React.ComponentProps<typeof ActionRow>) {
  return <Pressable accessibilityRole="button" accessibilityLabel={props.label} onPress={props.onPress}
    style={({pressed}) => [s.shortcut, pressed && s.pressed]}>
    <Ionicons name={props.icon} size={24} color={Colors.gradientMid} />
    <Text style={s.actionTitle}>{props.title}</Text><Text style={s.detail}>{props.detail}</Text>
  </Pressable>;
}
const s = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 110 },
  content: { width: "100%", maxWidth: 560, alignSelf: "center", gap: 24 },
  brand: { height: 72, overflow: "hidden", justifyContent: "center", alignItems: "center" },
  logo: { width: 320, height: 213, position: "absolute" },
  hero: { overflow: "hidden", borderRadius: 24, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderGlass },
  heroArtwork: { width: "100%", aspectRatio: 2.25, overflow: "hidden" },
  heroImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  heroCopy: { padding: 20, gap: 12 },
  eyebrow: { color: Colors.gradientMid, fontSize: 11, letterSpacing: 1.5, fontFamily: "Inter_600SemiBold" },
  title: { color: Colors.textPrimary, fontSize: 30, lineHeight: 36, fontFamily: "Inter_700Bold" },
  description: { color: Colors.textSecondary, fontSize: 15, lineHeight: 23 },
  primary: { minHeight: 54, borderRadius: 15, backgroundColor: Colors.gradientStart, flexDirection: "row", alignItems: "center", padding: 14, gap: 10, marginTop: 4 },
  primaryText: { flex: 1, fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.background },
  hint: { color: Colors.textTertiary, fontSize: 11, lineHeight: 17 },
  section: { gap: 12 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 17, fontFamily: "Inter_600SemiBold" },
  songCard: { backgroundColor: Colors.surface, borderRadius: 20, borderWidth: 1, borderColor: Colors.borderGlass },
  action: { flexDirection: "row", alignItems: "center", minHeight: 80, padding: 16, gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 13, backgroundColor: Colors.accentSubtle, alignItems: "center", justifyContent: "center" },
  actionCopy: { flex: 1, minWidth: 0, gap: 4 },
  actionTitle: { color: Colors.textPrimary, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  detail: { color: Colors.textTertiary, fontSize: 12, lineHeight: 18 },
  divider: { height: 1, backgroundColor: Colors.borderGlass, marginHorizontal: 16 },
  shortcuts: { flexDirection: "row", gap: 12 },
  shortcut: { flex: 1, minWidth: 0, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderGlass, borderRadius: 20, padding: 16, gap: 9 },
  pressed: { opacity: 0.72 },
});
