import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { CLERK_CONFIGURED, useAppUser } from "@/lib/use-app-user";
import { PendingApprovalGate } from "./PendingApprovalGate";

type Props = { children: React.ReactNode };

export function AppGate({ children }: Props) {
  if (!CLERK_CONFIGURED) return <>{children}</>;
  return <AppGateInner>{children}</AppGateInner>;
}

function AppGateInner({ children }: Props) {
  const { user, loading, reload } = useAppUser();

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={Colors.textTertiary} />
      </View>
    );
  }

  if (!user) {
    // Not signed in or app_users row missing — let downstream UI handle (sign-in CTA).
    return <>{children}</>;
  }

  if (user.status === "pending" || user.status === "banned") {
    return (
      <PendingApprovalGate
        status={user.status}
        email={user.email}
        onRefresh={() => {
          void reload();
        }}
      />
    );
  }

  // Pilot user with active expiry — show subtle countdown banner above app.
  const pilotMsRemaining = user.pilotExpiresAt ? Date.parse(user.pilotExpiresAt) - Date.now() : null;
  const showPilotBanner = pilotMsRemaining !== null && pilotMsRemaining > 0 && user.status === "approved";

  return (
    <View style={styles.wrapper}>
      {showPilotBanner ? <PilotBanner msRemaining={pilotMsRemaining} /> : null}
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

function PilotBanner({ msRemaining }: { msRemaining: number }) {
  const days = Math.floor(msRemaining / 86_400_000);
  const hours = Math.floor((msRemaining % 86_400_000) / 3_600_000);
  const isUrgent = msRemaining < 48 * 3_600_000;
  const label =
    days >= 1
      ? `${days}d ${hours}h left in pilot`
      : `${hours}h left in pilot`;
  return (
    <View
      style={[
        styles.pilotBanner,
        isUrgent && { borderColor: Colors.warningUnderline + "88" },
      ]}
    >
      <Ionicons
        name="time-outline"
        size={12}
        color={isUrgent ? Colors.warningUnderline : Colors.gradientMid}
      />
      <Text style={[styles.pilotText, isUrgent && { color: Colors.warningUnderline }]}>
        Pilot access — {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: Colors.background },
  loadingScreen: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  pilotBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gradientMid + "44",
  },
  pilotText: {
    color: Colors.gradientMid,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
});
