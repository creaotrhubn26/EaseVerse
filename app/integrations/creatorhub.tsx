import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { authedFetch } from "@/lib/authed-fetch";
import { useAuth } from "@/lib/creatorhub-auth";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default function CreatorHubIntegrationScreen() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const { getToken, isLoaded, isSignedIn, signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || linking) return;
    const creatorhubProjectId = one(params.creatorhubProjectId);
    if (!creatorhubProjectId) {
      setError("The CreatorHub project link is incomplete.");
      return;
    }
    setLinking(true);
    void (async () => {
      try {
        const token = await getToken();
        const response = await authedFetch("/api/integrations/creatorhub/context", token, {
          method: "POST",
          body: JSON.stringify({
            creatorhubProjectId,
            audioReviewProjectId: one(params.audioReviewProjectId) || undefined,
            externalTrackId: one(params.externalTrackId) || undefined,
            projectName: one(params.projectName) || "CreatorHub song",
            returnTo: one(params.returnTo) || undefined,
          }),
        });
        if (!response.ok) throw new Error(`Could not link project (${response.status})`);
        const payload = await response.json() as { project?: { id?: string } };
        if (!payload.project?.id) throw new Error("EaseVerse did not return a project.");
        router.replace({ pathname: "/projects/[id]", params: { id: payload.project.id } });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not open the CreatorHub project.");
        setLinking(false);
      }
    })();
  }, [getToken, isLoaded, isSignedIn, linking, params]);

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Ionicons name="musical-notes" size={30} color={Colors.gradientStart} />
        <Text style={styles.title}>Open CreatorHub song</Text>
        <Text style={styles.body}>
          EaseVerse will connect this song to Workspace Sound Room and Pro Tools Companion.
        </Text>
        {!isLoaded || linking ? <ActivityIndicator color={Colors.gradientStart} /> : null}
        {isLoaded && !isSignedIn ? (
          <Pressable style={styles.button} onPress={() => void signIn()} accessibilityRole="button">
            <Text style={styles.buttonText}>Continue with CreatorHub</Text>
          </Pressable>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center", padding: 20 },
  card: {
    width: "100%", maxWidth: 480, padding: 24, borderRadius: 18, gap: 14, alignItems: "center",
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderGlass,
  },
  title: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 20 },
  body: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 19, textAlign: "center" },
  button: { minHeight: 44, borderRadius: 10, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", backgroundColor: Colors.gradientStart },
  buttonText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },
  error: { color: Colors.dangerUnderline, fontFamily: "Inter_500Medium", fontSize: 12, textAlign: "center" },
});
