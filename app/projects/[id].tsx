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
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { CLERK_CONFIGURED } from "@/lib/use-app-user";
import { Platform } from "react-native";
import {
  addMember,
  getProject,
  removeMember,
  uploadReferenceTrack,
  type Project,
  type ProjectMember,
  type ProjectRole,
} from "@/lib/projects-client";

const ROLE_OPTIONS: { value: ProjectRole; label: string }[] = [
  { value: "vocalist", label: "Vocalist" },
  { value: "band_member", label: "Band member" },
  { value: "mix_engineer", label: "Mix engineer" },
  { value: "observer", label: "Observer" },
];

export default function ProjectDetailScreen() {
  if (!CLERK_CONFIGURED) return null;
  return <ProjectDetailInner />;
}

function ProjectDetailInner() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { useAuth } = require("@clerk/clerk-expo") as typeof import("@clerk/clerk-expo");
  const { getToken } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [viewerRole, setViewerRole] = useState<ProjectRole>("observer");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<ProjectRole>("band_member");
  const [inviting, setInviting] = useState(false);
  const [refUploading, setRefUploading] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const token = await getToken();
      const data = await getProject(token, String(id));
      setProject(data.project);
      setMembers(data.members);
      setViewerRole(data.viewerRole);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [getToken, id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleInvite() {
    if (!inviteEmail.trim() || inviting) return;
    setInviting(true);
    try {
      const token = await getToken();
      const result = await addMember(token, String(id), inviteEmail.trim(), inviteRole);
      if (result.kind === "pending") {
        setError(`Invitation email sent to ${result.email} — they'll be added when they sign up.`);
      } else {
        setError(null);
      }
      setInviteEmail("");
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setInviting(false);
    }
  }

  async function handleReferenceFile(file: File) {
    setRefUploading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Missing auth token");
      let durationSec: number | undefined;
      try {
        const url = URL.createObjectURL(file);
        const audio = new Audio(url);
        await new Promise<void>((resolve, reject) => {
          audio.addEventListener("loadedmetadata", () => resolve(), { once: true });
          audio.addEventListener("error", () => reject(new Error("audio metadata")), { once: true });
        });
        durationSec = audio.duration;
        URL.revokeObjectURL(url);
      } catch {
        // Duration is optional.
      }
      await uploadReferenceTrack({ projectId: String(id), file, durationSec, token });
      setTimeout(() => void reload(), 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRefUploading(false);
    }
  }

  async function handleRemove(userId: string) {
    try {
      const token = await getToken();
      await removeMember(token, String(id), userId);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 32, alignItems: "center" }]}>
        <ActivityIndicator color={Colors.textTertiary} />
      </View>
    );
  }
  if (!project) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 16, padding: 16 }]}>
        <Text style={styles.error}>{error || "Project not found."}</Text>
      </View>
    );
  }

  const isProducer = viewerRole === "producer";

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
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Project</Text>
          <Text style={styles.title} numberOfLines={1}>{project.name}</Text>
        </View>
      </View>

      <View style={styles.refCard}>
        <Text style={styles.cardLabel}>Reference track</Text>
        {project.referenceTrackUrl ? (
          <View style={{ gap: 6 }}>
            <Text style={styles.refName} numberOfLines={1}>
              {project.referenceTrackName || "Reference track"}
              {project.referenceTrackDurationSec
                ? ` · ${project.referenceTrackDurationSec.toFixed(1)}s`
                : ""}
            </Text>
            {Platform.OS === "web" ? (
              <audio
                controls
                preload="none"
                src={project.referenceTrackUrl}
                style={{ width: "100%", height: 32 }}
              />
            ) : null}
          </View>
        ) : (
          <Text style={styles.cardHint}>
            No reference yet. The producer can upload a demo or final mix so the band hears the target.
          </Text>
        )}
        {isProducer && Platform.OS === "web" ? (
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 6 }}>
            <input
              type="file"
              accept="audio/*"
              disabled={refUploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleReferenceFile(f);
                e.target.value = "";
              }}
              style={{ color: Colors.textSecondary }}
            />
            {refUploading ? <ActivityIndicator color={Colors.textTertiary} /> : null}
          </View>
        ) : null}
      </View>

      <Text style={styles.sectionLabel}>Members ({members.length})</Text>
      {members.map((m) => (
        <View key={m.userId} style={styles.memberRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.memberEmail} numberOfLines={1}>
              {m.email || m.userId}
            </Text>
            <Text style={styles.memberRole}>{roleLabel(m.role)}</Text>
          </View>
          {isProducer && m.role !== "producer" ? (
            <Pressable
              onPress={() => handleRemove(m.userId)}
              style={styles.removeBtn}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${m.email || m.userId}`}
            >
              <Text style={styles.removeBtnText}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      ))}

      {isProducer ? (
        <View style={styles.inviteCard}>
          <Text style={styles.cardLabel}>Invite member</Text>
          <Text style={styles.cardHint}>
            They must already have an EaseVerse account (sign-up at the home page).
          </Text>
          <TextInput
            value={inviteEmail}
            onChangeText={setInviteEmail}
            placeholder="band-member@example.com"
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
            keyboardType="email-address"
            inputMode="email"
            style={styles.input}
          />
          <View style={styles.roleRow}>
            {ROLE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setInviteRole(opt.value)}
                style={[styles.roleChip, inviteRole === opt.value && styles.roleChipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: inviteRole === opt.value }}
              >
                <Text
                  style={[styles.roleChipText, inviteRole === opt.value && styles.roleChipTextActive]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={handleInvite}
            disabled={!inviteEmail.trim() || inviting}
            style={[styles.primaryBtn, (!inviteEmail.trim() || inviting) && { opacity: 0.4 }]}
          >
            <Text style={styles.primaryBtnText}>{inviting ? "Inviting…" : "Add member"}</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

function roleLabel(role: ProjectRole): string {
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
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  eyebrow: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  title: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 20, marginTop: 1 },
  sectionLabel: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 6,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  memberEmail: { color: Colors.textPrimary, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  memberRole: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 2 },
  removeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Colors.dangerUnderline + "66",
  },
  removeBtnText: {
    color: Colors.dangerUnderline,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  inviteCard: {
    marginTop: 8,
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
  cardHint: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    lineHeight: 16,
  },
  input: {
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
  roleRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  roleChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  roleChipActive: {
    borderColor: Colors.gradientStart,
    backgroundColor: Colors.gradientStart + "22",
  },
  roleChipText: {
    color: Colors.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  roleChipTextActive: { color: Colors.gradientStart },
  primaryBtn: {
    paddingVertical: 11,
    borderRadius: 9,
    backgroundColor: Colors.gradientStart,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },
  error: { color: Colors.dangerUnderline, fontFamily: "Inter_500Medium", fontSize: 12 },
  refCard: {
    marginTop: 6,
    padding: 14,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 8,
  },
  refName: { color: Colors.textPrimary, fontFamily: "Inter_600SemiBold", fontSize: 13 },
});
