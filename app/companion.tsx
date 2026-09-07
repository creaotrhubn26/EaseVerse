import React from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

const CREATORHUB_WORKSPACE_URL = `${(process.env.EXPO_PUBLIC_CREATORHUB_URL || "https://www.creatorhubn.com").replace(/\/+$/, "")}/workspace`;

export default function CompanionScreen() {
  const insets = useSafeAreaInsets();

  const openWorkspace = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.assign(CREATORHUB_WORKSPACE_URL);
      return;
    }
    void Linking.openURL(CREATORHUB_WORKSPACE_URL);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 32,
        paddingHorizontal: 16,
        gap: 14,
      }}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>CreatorHub Pro Tools Companion</Text>
          <Text style={styles.title}>One connected studio flow</Text>
        </View>
      </View>

      <View style={styles.hero}>
        <Ionicons name="hardware-chip-outline" size={30} color={Colors.gradientMid} />
        <Text style={styles.heroTitle}>Companion is managed from Sound Room</Text>
        <Text style={styles.body}>
          Pairing now starts in CreatorHub Workspace. The pairing code carries the exact Workspace project,
          Sound Room and EaseVerse track into the desktop app, so you do not create a second connection here.
        </Text>
      </View>

      <View style={styles.steps}>
        {[
          "Open the music project in CreatorHub Workspace.",
          "Choose Sound Room → Pro Tools Companion.",
          "Download the app and enter the six-digit one-time code.",
          "Select Session Info and Bounced Files. Markers, tempo and mixes sync automatically.",
        ].map((step, index) => (
          <View key={step} style={styles.stepRow}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      <Pressable onPress={openWorkspace} style={({ pressed }) => [styles.primary, pressed && styles.pressed]} accessibilityRole="link">
        <Ionicons name="open-outline" size={17} color="#fff" />
        <Text style={styles.primaryText}>Open CreatorHub Workspace</Text>
      </Pressable>

      <View style={styles.note}>
        <Ionicons name="shield-checkmark-outline" size={17} color={Colors.textTertiary} />
        <Text style={styles.noteText}>
          EaseVerse and Workspace use the same CreatorHub sign-in. The former standalone EaseVerse pairing flow has been retired.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  eyebrow: { color: Colors.textTertiary, fontFamily: "Inter_600SemiBold", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  title: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 22, marginTop: 2 },
  hero: { padding: 18, gap: 10, borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderGlass },
  heroTitle: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 17 },
  body: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 20 },
  steps: { gap: 10, paddingVertical: 4 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepNumber: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.surface },
  stepNumberText: { color: Colors.gradientMid, fontFamily: "Inter_700Bold", fontSize: 12 },
  stepText: { flex: 1, color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 19 },
  primary: { minHeight: 48, borderRadius: 13, backgroundColor: Colors.gradientMid, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  pressed: { opacity: 0.78 },
  primaryText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 12, backgroundColor: Colors.surface },
  noteText: { flex: 1, color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 17 },
});
