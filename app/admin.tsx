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
import { useAuth } from "@clerk/clerk-expo";
import Colors from "@/constants/colors";
import { CLERK_CONFIGURED, useAppUser, type AppUser } from "@/lib/use-app-user";
import { authedFetch } from "@/lib/authed-fetch";
import { ProToolsPairingCard } from "@/components/ProToolsPairingCard";

type AdminUsageRow = {
  userId: string | null;
  email: string | null;
  status: string | null;
  requests: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
};

function formatUsd(value: number): string {
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

export default function AdminScreen() {
  if (!CLERK_CONFIGURED) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Admin is unavailable</Text>
        <Text style={styles.subtitle}>Clerk is not configured in this build.</Text>
      </View>
    );
  }
  return <AdminScreenInner />;
}

function AdminScreenInner() {
  const insets = useSafeAreaInsets();
  const { getToken, isSignedIn } = useAuth();
  const { user, loading } = useAppUser();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [usage, setUsage] = useState<AdminUsageRow[]>([]);
  const [window, setWindow] = useState<"day" | "week" | "month">("month");
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const [usersRes, usageRes] = await Promise.all([
        authedFetch("/api/admin/users", token, { method: "GET" }),
        authedFetch(`/api/admin/usage?window=${window}`, token, { method: "GET" }),
      ]);
      if (!usersRes.ok) throw new Error(`users: ${usersRes.status}`);
      if (!usageRes.ok) throw new Error(`usage: ${usageRes.status}`);
      const usersJson = (await usersRes.json()) as { users: AppUser[] };
      const usageJson = (await usageRes.json()) as { perUser: AdminUsageRow[] };
      setUsers(usersJson.users);
      setUsage(usageJson.perUser);
    } catch (err) {
      setError((err as Error).message || "Load failed");
    }
  }, [getToken, window]);

  useEffect(() => {
    if (user?.status === "admin") {
      void load();
    }
  }, [user?.status, load]);

  async function changeStatus(
    targetUserId: string,
    status: AppUser["status"],
    pilotDays?: number | null,
  ) {
    setWorking(targetUserId);
    try {
      const token = await getToken();
      const res = await authedFetch("/api/admin/users", token, {
        method: "POST",
        body: JSON.stringify({ targetUserId, status, pilotDays }),
      });
      if (!res.ok) throw new Error(`status: ${res.status}`);
      await load();
    } catch (err) {
      setError((err as Error).message || "Status update failed");
    } finally {
      setWorking(null);
    }
  }

  function pilotCountdown(iso: string | null): string {
    if (!iso) return "";
    const ms = Date.parse(iso) - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return "expired";
    const days = Math.floor(ms / 86_400_000);
    const hours = Math.floor((ms % 86_400_000) / 3_600_000);
    if (days >= 1) return `${days}d ${hours}h left`;
    return `${hours}h left`;
  }

  if (!isSignedIn) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Sign in to view admin</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator color={Colors.textTertiary} />
      </View>
    );
  }

  if (!user || user.status !== "admin") {
    return (
      <View style={styles.screen}>
        <Ionicons name="lock-closed" size={32} color={Colors.textTertiary} />
        <Text style={styles.title}>Admin only</Text>
        <Text style={styles.subtitle}>You don&apos;t have access to this dashboard.</Text>
      </View>
    );
  }

  const usageByUser = new Map(usage.map((u) => [u.userId, u]));

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32, paddingHorizontal: 16 }}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.header}>Admin dashboard</Text>
      </View>

      <View style={styles.windowRow}>
        {(["day", "week", "month"] as const).map((w) => (
          <Pressable
            key={w}
            onPress={() => setWindow(w)}
            style={[styles.windowChip, window === w && styles.windowChipActive]}
            accessibilityRole="button"
            accessibilityLabel={`Usage window ${w}`}
            accessibilityState={{ selected: window === w }}
          >
            <Text style={[styles.windowChipText, window === w && styles.windowChipTextActive]}>
              {w === "day" ? "1d" : w === "week" ? "7d" : "30d"}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ChangelogComposer getToken={getToken} />

      <ProToolsPairingCard horizontalMargin={0} getToken={getToken} />

      <Text style={styles.section}>Users ({users.length})</Text>
      {users.map((u) => {
        const u_usage = usageByUser.get(u.userId);
        return (
          <View key={u.userId} style={styles.userCard}>
            <View style={styles.userHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.userEmail}>{u.email || "(no email)"}</Text>
                <Text style={styles.userMeta}>
                  {u.status} · joined {new Date(u.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <Text style={styles.userCost}>
                {u_usage ? formatUsd(u_usage.costUsd) : "—"}
              </Text>
            </View>
            <Text style={styles.userTokens}>
              {u_usage
                ? `${u_usage.requests} req · in ${formatTokens(u_usage.inputTokens)} · out ${formatTokens(u_usage.outputTokens)}`
                : "no usage in window"}
            </Text>
            {u.pilotExpiresAt ? (
              <Text style={styles.pilotRow}>
                Pilot — {pilotCountdown(u.pilotExpiresAt)}
              </Text>
            ) : null}
            <View style={styles.actionRow}>
              {u.status !== "approved" && u.status !== "admin" ? (
                <Pressable
                  onPress={() => changeStatus(u.userId, "approved")}
                  disabled={working === u.userId}
                  style={[styles.actionBtn, styles.actionApprove]}
                  accessibilityRole="button"
                  accessibilityLabel={`Approve ${u.email} permanently`}
                >
                  <Ionicons name="checkmark" size={12} color="#fff" />
                  <Text style={styles.actionText}>Approve</Text>
                </Pressable>
              ) : null}
              {u.status !== "admin" ? (
                <View style={styles.pilotPickerRow}>
                  <Text style={styles.pilotPickerLabel}>Pilot:</Text>
                  {[7, 14, 30, 90].map((days) => (
                    <Pressable
                      key={`pilot-${days}`}
                      onPress={() => changeStatus(u.userId, "approved", days)}
                      disabled={working === u.userId}
                      style={[styles.actionBtn, styles.actionPilot]}
                      accessibilityRole="button"
                      accessibilityLabel={`Grant ${u.email} pilot for ${days} days`}
                    >
                      <Text style={styles.actionText}>{days}d</Text>
                    </Pressable>
                  ))}
                  {u.pilotExpiresAt ? (
                    <Pressable
                      onPress={() => changeStatus(u.userId, u.status === "approved" ? "approved" : u.status, 0)}
                      disabled={working === u.userId}
                      style={[styles.actionBtn, styles.actionPending]}
                      accessibilityRole="button"
                      accessibilityLabel={`Clear pilot expiry for ${u.email}`}
                    >
                      <Text style={[styles.actionText, { color: Colors.textPrimary }]}>Clear</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              {u.status !== "banned" ? (
                <Pressable
                  onPress={() => changeStatus(u.userId, "banned")}
                  disabled={working === u.userId}
                  style={[styles.actionBtn, styles.actionBan]}
                  accessibilityRole="button"
                  accessibilityLabel={`Ban ${u.email}`}
                >
                  <Ionicons name="ban" size={12} color="#fff" />
                  <Text style={styles.actionText}>Ban</Text>
                </Pressable>
              ) : null}
              {u.status === "banned" || u.status === "approved" ? (
                <Pressable
                  onPress={() => changeStatus(u.userId, "pending")}
                  disabled={working === u.userId}
                  style={[styles.actionBtn, styles.actionPending]}
                  accessibilityRole="button"
                  accessibilityLabel={`Reset ${u.email} to pending`}
                >
                  <Ionicons name="time-outline" size={12} color={Colors.textPrimary} />
                  <Text style={[styles.actionText, { color: Colors.textPrimary }]}>Reset</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function ChangelogComposer({ getToken }: { getToken: () => Promise<string | null> }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tag, setTag] = useState("");
  const [posting, setPosting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function publish() {
    if (!title.trim() || !body.trim()) {
      setStatus("Title and body required");
      return;
    }
    setPosting(true);
    setStatus(null);
    try {
      const token = await getToken();
      const response = await authedFetch("/api/changelog", token, {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), body: body.trim(), tag: tag.trim() || undefined }),
      });
      if (!response.ok) {
        throw new Error(`Publish failed: ${response.status}`);
      }
      setTitle("");
      setBody("");
      setTag("");
      setStatus("Published");
      setTimeout(() => setStatus(null), 1800);
    } catch (err) {
      setStatus((err as Error).message || "Publish failed");
    } finally {
      setPosting(false);
    }
  }

  return (
    <View style={styles.changelogCard}>
      <Text style={styles.section}>Publish "What's new"</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Title (e.g. New: Pitch tracking overlay)"
        placeholderTextColor={Colors.textTertiary}
        style={styles.changelogInput}
        maxLength={120}
      />
      <TextInput
        value={tag}
        onChangeText={setTag}
        placeholder="Tag (optional, e.g. feature / fix / beta)"
        placeholderTextColor={Colors.textTertiary}
        style={styles.changelogInput}
        maxLength={40}
        autoCapitalize="none"
      />
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder="Details — markdown not rendered, plain text only"
        placeholderTextColor={Colors.textTertiary}
        style={[styles.changelogInput, { minHeight: 90, textAlignVertical: "top" as const }]}
        multiline
        maxLength={5000}
      />
      <Pressable
        onPress={publish}
        disabled={posting}
        style={[styles.actionBtn, styles.actionApprove, { alignSelf: "flex-start" as const }, posting && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel="Publish announcement to all users"
      >
        <Ionicons name="sparkles" size={12} color="#fff" />
        <Text style={styles.actionText}>{posting ? "Publishing…" : "Publish"}</Text>
      </Pressable>
      {status ? <Text style={styles.changelogStatus}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  screen: { flex: 1, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  title: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 20 },
  subtitle: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  header: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 22 },
  windowRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
  windowChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.surfaceGlass, borderWidth: 1, borderColor: Colors.borderGlass },
  windowChipActive: { backgroundColor: Colors.gradientStart, borderColor: Colors.gradientStart },
  windowChipText: { color: Colors.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 11 },
  windowChipTextActive: { color: "#fff" },
  section: { color: Colors.textTertiary, fontFamily: "Inter_600SemiBold", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 18, marginBottom: 8 },
  userCard: { padding: 14, borderRadius: 14, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderGlass, marginBottom: 8, gap: 8 },
  userHeader: { flexDirection: "row", alignItems: "flex-start" },
  userEmail: { color: Colors.textPrimary, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  userMeta: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 2 },
  userCost: { color: Colors.gradientStart, fontFamily: "Inter_700Bold", fontSize: 16 },
  userTokens: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 11 },
  actionRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  actionApprove: { backgroundColor: Colors.successUnderline },
  actionBan: { backgroundColor: Colors.dangerUnderline },
  actionPending: { backgroundColor: Colors.surfaceGlass, borderWidth: 1, borderColor: Colors.borderGlass },
  actionPilot: { backgroundColor: Colors.gradientMid },
  pilotRow: { color: Colors.gradientMid, fontFamily: "Inter_600SemiBold", fontSize: 11 },
  pilotPickerRow: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  pilotPickerLabel: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 11, marginRight: 2 },
  actionText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 11 },
  error: { color: Colors.dangerUnderline, fontFamily: "Inter_500Medium", fontSize: 12, marginBottom: 8 },
  changelogCard: {
    marginTop: 16,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 8,
  },
  changelogInput: {
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: Colors.textPrimary,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  changelogStatus: {
    color: Colors.textTertiary,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
});
