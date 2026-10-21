import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back">
        <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
      </Pressable>
      <View style={styles.icon}>
        <Ionicons name="people-outline" size={30} color={Colors.gradientMid} />
      </View>
      <Text style={styles.title}>Your invitation starts with your producer</Text>
      <Text style={styles.subtitle}>
        Your producer sends a personal invitation to each artist and band member. Open the link in that email to complete your EaseVerse profile and join the shared studio project.
      </Text>
      <View style={styles.steps}>
        <Text style={styles.step}>1. Open your personal invitation email.</Text>
        <Text style={styles.step}>2. Sign in with the invited email address.</Text>
        <Text style={styles.step}>3. Complete your profile and open the project.</Text>
        <Text style={styles.subtitle}>Already joined? Sign in below. Each band member uses their own profile and invitation.</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={continueWithCreatorHub} disabled={isSigningIn} accessibilityRole="button" accessibilityLabel="Sign in to EaseVerse">
        <LinearGradient colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd] as const} style={styles.primary}>
          {isSigningIn ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Sign in to EaseVerse</Text>}
        </LinearGradient>
      </Pressable>
      <Pressable onPress={() => router.replace("/(tabs)/profile")} style={styles.secondary} accessibilityRole="button" accessibilityLabel="Back to Profile">
        <Text style={styles.secondaryText}>Back to Profile</Text>
        <Ionicons name="arrow-back" size={16} color={Colors.textPrimary} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  steps:{gap:10},step:{color:Colors.textPrimary,fontSize:14,lineHeight:21,fontFamily:"Inter_500Medium"},
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingBottom: 44, gap: 14 },
  back: { position: "absolute", left: 16, top: 20, padding: 8 },
  icon: { width: 58, height: 58, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderGlass },
  title: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 28 },
  subtitle: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22, marginBottom: 8 },
  error: { color: Colors.dangerUnderline, fontFamily: "Inter_500Medium" },
  primary: { minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  primaryText: { color: Colors.background, fontFamily: "Inter_700Bold", fontSize: 15 },
  secondary: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderGlass, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  secondaryText: { color: Colors.textPrimary, fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
