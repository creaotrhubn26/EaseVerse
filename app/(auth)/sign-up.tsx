import React, { useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/creatorhub-auth";

export default function SignUpScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, isSigningIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const continueWithCreatorHub = async () => {
    setError(null);
    try {
      const completed = await signIn();
      if (completed) router.replace("/(tabs)");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "CreatorHub login failed.");
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 28 }]}>
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
        <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
      </Pressable>
      <View style={styles.icon}>
        <Ionicons name="people-outline" size={30} color={Colors.gradientMid} />
      </View>
      <Text style={styles.title}>CreatorHub account required</Text>
      <Text style={styles.subtitle}>
        EaseVerse uses the same identity as CreatorHub Workspace. If you already have a Workspace account, continue below. New accounts are created and managed in CreatorHub.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={continueWithCreatorHub} disabled={isSigningIn}>
        <LinearGradient colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd] as const} style={styles.primary}>
          {isSigningIn ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Continue with CreatorHub</Text>}
        </LinearGradient>
      </Pressable>
      <Pressable onPress={() => void Linking.openURL("https://www.creatorhubn.com")} style={styles.secondary}>
        <Text style={styles.secondaryText}>Open CreatorHub Workspace</Text>
        <Ionicons name="open-outline" size={16} color={Colors.textPrimary} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingBottom: 44, gap: 14 },
  back: { position: "absolute", left: 16, top: 20, padding: 8 },
  icon: { width: 58, height: 58, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderGlass },
  title: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 28 },
  subtitle: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22, marginBottom: 8 },
  error: { color: Colors.dangerUnderline, fontFamily: "Inter_500Medium" },
  primary: { minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 },
  secondary: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderGlass, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  secondaryText: { color: Colors.textPrimary, fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
