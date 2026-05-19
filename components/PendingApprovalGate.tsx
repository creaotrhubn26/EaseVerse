import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useClerk } from "@clerk/clerk-expo";
import Colors from "@/constants/colors";

type Props = {
  status: "pending" | "banned";
  email: string | null;
  onRefresh: () => void;
};

export function PendingApprovalGate({ status, email, onRefresh }: Props) {
  const banned = status === "banned";
  const { signOut } = useClerk();
  return (
    <View style={styles.container}>
      <View style={[styles.card, banned && styles.cardBanned]}>
        <Ionicons
          name={banned ? "ban" : "hourglass-outline"}
          size={42}
          color={banned ? Colors.dangerUnderline : Colors.gradientStart}
        />
        <Text style={styles.title}>
          {banned ? "Access blocked" : "Waiting for approval"}
        </Text>
        <Text style={styles.subtitle}>
          {banned
            ? "Your account is suspended. Reach out if you think this is a mistake."
            : "EaseVerse is in private prototype testing. An admin needs to approve your account before you can record."}
        </Text>
        {email ? (
          <Text style={styles.email}>Signed in as {email}</Text>
        ) : null}
        <View style={styles.actionRow}>
          <Pressable
            onPress={onRefresh}
            style={styles.refreshBtn}
            accessibilityRole="button"
            accessibilityLabel="Re-check approval status"
          >
            <Ionicons name="refresh" size={14} color={Colors.textPrimary} />
            <Text style={styles.refreshText}>Check again</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void signOut();
            }}
            style={styles.refreshBtn}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Ionicons name="log-out-outline" size={14} color={Colors.textPrimary} />
            <Text style={styles.refreshText}>Sign out</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    padding: 24,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    alignItems: "center",
    gap: 10,
  },
  cardBanned: {
    borderColor: Colors.dangerUnderline + "55",
  },
  title: {
    color: Colors.textPrimary,
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    textAlign: "center",
  },
  subtitle: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  email: {
    color: Colors.textTertiary,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginTop: 8,
  },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  refreshText: {
    color: Colors.textPrimary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
});
