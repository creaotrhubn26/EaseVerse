import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { NATIVE_CALLBACK_URL, useAuth } from "@/lib/creatorhub-auth";
import { safeCreatorHubAuthNextPath } from "@/lib/auth-return";

function valueOf(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{
    native?: string;
    chGoogleStatus?: string;
    chGoogleTransfer?: string;
    chGoogleMessage?: string;
    next?: string;
  }>();
  const { completeSignIn, isLoaded } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const native = valueOf(params.native) === "1";
    const status = valueOf(params.chGoogleStatus);
    const transferId = valueOf(params.chGoogleTransfer);
    const message = valueOf(params.chGoogleMessage);
    const next = safeCreatorHubAuthNextPath(valueOf(params.next));

    if (Platform.OS === "web" && native && typeof window !== "undefined") {
      const callback = new URL(NATIVE_CALLBACK_URL);
      if (status) callback.searchParams.set("chGoogleStatus", status);
      if (transferId) callback.searchParams.set("chGoogleTransfer", transferId);
      if (message) callback.searchParams.set("chGoogleMessage", message);
      if (next) callback.searchParams.set("next", next);
      window.location.replace(callback.toString());
      return;
    }

    if (!isLoaded) return;
    if (status === "error") {
      setError(message ?? "CreatorHub login failed.");
      return;
    }
    if (!transferId) {
      setError("CreatorHub login callback was incomplete.");
      return;
    }

    let cancelled = false;
    void completeSignIn(transferId)
      .then(() => {
        if (!cancelled) router.replace((next || "/(tabs)") as never);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Login failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [completeSignIn, isLoaded, params.chGoogleMessage, params.chGoogleStatus, params.chGoogleTransfer, params.native, params.next]);

  return (
    <View style={styles.container}>
      {error ? (
        <>
          <Ionicons name="alert-circle-outline" size={36} color={Colors.dangerUnderline} />
          <Text style={styles.title}>Could not sign in</Text>
          <Text style={styles.message}>{error}</Text>
          <Pressable onPress={() => router.replace("/(auth)/sign-in")} style={styles.button}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator color={Colors.gradientMid} />
          <Text style={styles.title}>Completing CreatorHub login…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 28,
    backgroundColor: Colors.background,
  },
  title: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 20 },
  message: { color: Colors.textSecondary, textAlign: "center", lineHeight: 20 },
  button: { borderRadius: 12, backgroundColor: Colors.gradientStart, paddingHorizontal: 20, paddingVertical: 12 },
  buttonText: { color: "#fff", fontFamily: "Inter_700Bold" },
});
