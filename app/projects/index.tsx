import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { AUTH_CONFIGURED } from "@/lib/use-app-user";
import { createProject, listProjects, type ProjectListItem } from "@/lib/projects-client";

export default function ProjectsScreen() {
  if (!AUTH_CONFIGURED) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Projects are unavailable</Text>
        <Text style={styles.subtitle}>Sign in to manage studio projects.</Text>
      </View>
    );
  }
  return <ProjectsInner />;
}

function ProjectsInner() {
  const insets = useSafeAreaInsets();
  const { useAuth } = require("@/lib/creatorhub-auth") as typeof import("@/lib/creatorhub-auth");
  const { getToken, isSignedIn } = useAuth();
  const [projects, setProjectList] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isSignedIn) {
      setLoading(false);
      return;
    }
    try {
      const token = await getToken();
      const list = await listProjects(token);
      setProjectList(list);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [getToken, isSignedIn]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleCreate() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const token = await getToken();
      const project = await createProject(token, newName.trim());
      setNewName("");
      await reload();
      router.push({ pathname: "/projects/[id]", params: { id: project.id } });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  if (!isSignedIn) {
    return (
      <View
        style={[
          styles.signedOutScreen,
          { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.signedOutBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <View style={styles.signedOutIcon}>
          <Ionicons name="albums-outline" size={30} color={Colors.gradientMid} />
        </View>
        <Text style={styles.signedOutEyebrow}>CREATORHUB WORKSPACE</Text>
        <Text style={styles.signedOutTitle}>Your music projects, one login</Text>
        <Text style={styles.signedOutSubtitle}>
          Sign in with the same CreatorHub account you use in Workspace to open projects, Sound Room reviews, and Pro Tools Companion pairing.
        </Text>
        <Pressable
          onPress={() => router.push("/(auth)/sign-in")}
          style={styles.signedOutButton}
          accessibilityRole="button"
          accessibilityLabel="Continue with CreatorHub"
        >
          <Ionicons name="log-in-outline" size={19} color="#fff" />
          <Text style={styles.signedOutButtonText}>Continue with CreatorHub</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32, paddingHorizontal: 16, gap: 14 }}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Projects</Text>
      </View>

      <View style={styles.createCard}>
        <Text style={styles.cardLabel}>New project</Text>
        <View style={styles.row}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="e.g. Midnight Drive — Album"
            placeholderTextColor={Colors.textTertiary}
            style={styles.input}
            onSubmitEditing={handleCreate}
          />
          <Pressable
            onPress={handleCreate}
            disabled={!newName.trim() || creating}
            style={[styles.primaryBtn, (!newName.trim() || creating) && { opacity: 0.4 }]}
          >
            <Text style={styles.primaryBtnText}>{creating ? "…" : "Create"}</Text>
          </Pressable>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={Colors.textTertiary} />
      ) : projects.length === 0 ? (
        <Text style={styles.empty}>No projects yet. Create one above to invite your band.</Text>
      ) : (
        projects.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => router.push({ pathname: "/projects/[id]", params: { id: p.id } })}
            style={styles.projectCard}
            accessibilityRole="button"
            accessibilityLabel={`Open project ${p.name}`}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.projectName} numberOfLines={1}>{p.name}</Text>
              <Text style={styles.projectMeta}>
                {p.memberCount} member{p.memberCount === 1 ? "" : "s"} · {labelForRole(p.role)} ·{" "}
                {new Date(p.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

function labelForRole(role: string): string {
  switch (role) {
    case "producer": return "Producer";
    case "vocalist": return "Vocalist";
    case "band_member": return "Band member";
    case "mix_engineer": return "Mix engineer";
    default: return "Observer";
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  signedOutScreen: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: Colors.background,
    gap: 14,
  },
  signedOutBack: { position: "absolute", left: 16, top: 16, padding: 8 },
  signedOutIcon: {
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  signedOutEyebrow: {
    color: Colors.gradientMid,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1.1,
    marginTop: 6,
  },
  signedOutTitle: {
    color: Colors.textPrimary,
    fontFamily: "Inter_700Bold",
    fontSize: 30,
    lineHeight: 36,
  },
  signedOutSubtitle: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 4,
  },
  signedOutButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 14,
    backgroundColor: Colors.gradientMid,
  },
  signedOutButtonText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 22 },
  subtitle: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 13, marginTop: 8 },
  createCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 10,
  },
  cardLabel: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  row: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 9,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    color: Colors.textPrimary,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  primaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 9,
    backgroundColor: Colors.gradientStart,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },
  error: { color: Colors.dangerUnderline, fontFamily: "Inter_500Medium", fontSize: 12 },
  empty: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 12, fontStyle: "italic" },
  projectCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  projectName: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 15 },
  projectMeta: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 2 },
});
