import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
import Colors from "@/constants/colors";
import { authedFetch } from "@/lib/authed-fetch";

type Summary = {
  totalCostUsd: number;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byModel: { model: string; requests: number; costUsd: number; inputTokens: number; outputTokens: number }[];
  daily: { date: string; costUsd: number; requests: number }[];
};

type Response = { day: Summary | null; week: Summary | null; month: Summary | null };

type Props = { horizontalMargin?: number };

function formatUsd(value: number): string {
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function formatNum(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toString();
}

export function CostDashboardCard({ horizontalMargin = 16 }: Props) {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const response = await authedFetch("/api/usage", token, { method: "GET" });
        if (!response.ok) {
          setError(`Usage fetch failed: ${response.status}`);
          return;
        }
        const json = (await response.json()) as Response;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError((err as Error).message || "Usage fetch failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken]);

  if (!isSignedIn) return null;

  return (
    <View style={[styles.card, { marginHorizontal: horizontalMargin }]}>
      <View style={styles.headerRow}>
        <Ionicons name="bar-chart-outline" size={18} color={Colors.gradientMid} />
        <Text style={styles.title}>AI usage & cost</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.textTertiary} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : data ? (
        <>
          <View style={styles.statRow}>
            <Stat label="Today" cost={data.day?.totalCostUsd ?? 0} requests={data.day?.totalRequests ?? 0} />
            <Stat label="7 days" cost={data.week?.totalCostUsd ?? 0} requests={data.week?.totalRequests ?? 0} />
            <Stat label="30 days" cost={data.month?.totalCostUsd ?? 0} requests={data.month?.totalRequests ?? 0} />
          </View>
          {data.month && data.month.byModel.length > 0 ? (
            <View style={styles.modelList}>
              <Text style={styles.modelHeader}>By model (30 days)</Text>
              {data.month.byModel.map((m) => (
                <View key={m.model} style={styles.modelRow}>
                  <Text style={styles.modelName}>{m.model}</Text>
                  <View style={styles.modelMeta}>
                    <Text style={styles.modelMetaText}>{m.requests} req</Text>
                    <Text style={styles.modelMetaText}>
                      in {formatNum(m.inputTokens)} · out {formatNum(m.outputTokens)}
                    </Text>
                    <Text style={styles.modelCost}>{formatUsd(m.costUsd)}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>No usage recorded yet.</Text>
          )}
        </>
      ) : null}
    </View>
  );
}

function Stat({ label, cost, requests }: { label: string; cost: number; requests: number }) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statCost}>{formatUsd(cost)}</Text>
      <Text style={styles.statRequests}>{requests} req</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 12,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 15 },
  statRow: { flexDirection: "row", gap: 12 },
  statBlock: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    alignItems: "center",
  },
  statLabel: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 11 },
  statCost: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 16, marginTop: 4 },
  statRequests: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 2 },
  modelList: { gap: 8 },
  modelHeader: { color: Colors.textTertiary, fontFamily: "Inter_600SemiBold", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  modelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  modelName: { color: Colors.textPrimary, fontFamily: "Inter_500Medium", fontSize: 12, flex: 1 },
  modelMeta: { alignItems: "flex-end" },
  modelMetaText: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 10 },
  modelCost: { color: Colors.gradientStart, fontFamily: "Inter_700Bold", fontSize: 13, marginTop: 2 },
  empty: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 12, fontStyle: "italic" },
  error: { color: Colors.dangerUnderline, fontFamily: "Inter_500Medium", fontSize: 12 },
});
