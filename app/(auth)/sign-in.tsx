import React, { useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/creatorhub-auth";

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, isSigningIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    if (isSigningIn) return;
    setError(null);
    try {
      const completed = await signIn();
      if (completed && Platform.OS !== "web") router.replace("/(tabs)");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "CreatorHub login failed.");
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 28 }]}
    >
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
        <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
      </Pressable>
      <View style={styles.mark}>
        <Ionicons name="musical-notes" size={28} color={Colors.gradientMid} />
      </View>
      <Text style={styles.eyebrow}>CREATORHUB WORKSPACE</Text>
      <Text style={styles.title}>One login for your whole music workflow</Text>
      <Text style={styles.subtitle}>
        Continue with the same CreatorHub account you use in Workspace. Your EaseVerse projects and Pro Tools Companion pairing stay connected to that identity.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable onPress={start} disabled={isSigningIn} accessibilityRole="button">
        <LinearGradient
          colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd] as const}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.primary, isSigningIn && styles.disabled]}
        >
          {isSigningIn ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="logo-google" size={18} color="#fff" />
              <Text style={styles.primaryText}>Continue with CreatorHub</Text>
            </>
          )}
        </LinearGradient>
      </Pressable>

      <View style={styles.note}>
        <Ionicons name="shield-checkmark-outline" size={17} color={Colors.gradientMid} />
        <Text style={styles.noteText}>
          EaseVerse does not create a separate password or account. Authentication is handled by CreatorHub Workspace.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 44, justifyContent: "center", gap: 14 },
  back: { position: "absolute", left: 16, top: 20, padding: 8 },
  mark: { width: 58, height: 58, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderGlass },
  eyebrow: { color: Colors.gradientMid, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.2, marginTop: 8 },
  title: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 30, lineHeight: 36 },
  subtitle: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22, marginBottom: 8 },
  error: { color: Colors.dangerUnderline, fontFamily: "Inter_500Medium", fontSize: 13 },
  primary: { minHeight: 52, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  disabled: { opacity: 0.65 },
  primaryText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 },
  note: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 14, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderGlass, marginTop: 8 },
  noteText: { flex: 1, color: Colors.textTertiary, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
});
