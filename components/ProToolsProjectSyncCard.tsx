import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { authedFetch } from "@/lib/authed-fetch";
import { useAuth } from "@/lib/creatorhub-auth";
import { parseProToolsSyncRecord, type ProToolsSyncRecord } from "@/lib/protools-sync";

type LinkContext = {
  externalTrackId: string | null;
  returnTo: string | null;
  creatorhubProjectId: string;
  audioReviewProjectId: string | null;
};

type SyncResponse = {
  linked?: boolean;
  link?: LinkContext;
  item?: unknown;
};

function timeLabel(positionMs: number): string {
  const seconds = Math.max(0, Math.floor(positionMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ProToolsProjectSyncCard({ projectId }: { projectId: string }) {
  const { getToken } = useAuth();
  const [record, setRecord] = useState<ProToolsSyncRecord | null>(null);
  const [link, setLink] = useState<LinkContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const token = await getToken();
      const response = await authedFetch(
        `/api/projects/protools-sync?projectId=${encodeURIComponent(projectId)}`,
        token,
        { method: "GET" },
      );
      if (response.status === 404) {
        setLink(null);
        setRecord(null);
        setError(null);
        return;
      }
      if (!response.ok) throw new Error(`Sync status failed (${response.status})`);
      const payload = await response.json() as SyncResponse;
      setLink(payload.link ?? null);
      setRecord(parseProToolsSyncRecord(payload.item));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load Pro Tools sync");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [getToken, projectId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), 8_000);
    return () => clearInterval(timer);
  }, [load]);

  const summary = useMemo(() => {
    if (!record) return "Waiting for the first Pro Tools sync";
    return [
      record.bpm ? `${record.bpm} BPM` : null,
      record.keySignature ?? null,
      record.timeSignature ?? null,
      `${record.markers.length} marker${record.markers.length === 1 ? "" : "s"}`,
    ].filter(Boolean).join(" · ");
  }, [record]);

  if (!link && !loading && !error) return null;

  return (
    <View style={styles.card} accessibilityLabel="Pro Tools sync">
      <View style={styles.header}>
        <View style={styles.icon}>
          <Ionicons name="options-outline" size={18} color={Colors.gradientStart} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>CREATORHUB WORKSPACE</Text>
          <Text style={styles.title}>Pro Tools Companion</Text>
          <Text style={styles.subtitle}>{summary}</Text>
        </View>
        {loading ? <ActivityIndicator color={Colors.textTertiary} /> : (
          <Pressable onPress={() => void load()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Refresh Pro Tools sync">
            <Ionicons name="refresh" size={18} color={Colors.textSecondary} />
          </Pressable>
        )}
      </View>

      {record?.markers.length ? (
        <View style={styles.markerWrap}>
          {record.markers.slice(0, 12).map((marker) => (
            <View key={`${marker.id}-${marker.positionMs}`} style={styles.marker}>
              <Text style={styles.markerTime}>{timeLabel(marker.positionMs)}</Text>
              <Text style={styles.markerLabel} numberOfLines={1}>{marker.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {record ? (
        <Text style={styles.updated}>
          Synced {new Date(record.updatedAt).toLocaleString()} · revision {record.revision}
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {link?.returnTo ? (
        <Pressable
          onPress={() => void Linking.openURL(link.returnTo!)}
          style={styles.workspaceButton}
          accessibilityRole="link"
          accessibilityLabel="Back to CreatorHub Sound Room"
        >
          <Text style={styles.workspaceButtonText}>Open Sound Room</Text>
          <Ionicons name="open-outline" size={14} color="#fff" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.gradientStart + "55",
    gap: 12,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: {
    width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.gradientStart + "18",
  },
  eyebrow: { color: Colors.gradientStart, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.7 },
  title: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 15 },
  subtitle: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 2 },
  markerWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  marker: {
    flexDirection: "row", alignItems: "center", gap: 5, maxWidth: 180,
    borderRadius: 7, paddingHorizontal: 8, paddingVertical: 6,
    backgroundColor: Colors.surfaceGlass, borderWidth: 1, borderColor: Colors.borderGlass,
  },
  markerTime: { color: Colors.gradientStart, fontFamily: "Inter_700Bold", fontSize: 10 },
  markerLabel: { color: Colors.textPrimary, fontFamily: "Inter_500Medium", fontSize: 10, flexShrink: 1 },
  updated: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 10 },
  error: { color: Colors.dangerUnderline, fontFamily: "Inter_500Medium", fontSize: 11 },
  workspaceButton: {
    minHeight: 40, borderRadius: 9, paddingHorizontal: 12, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: Colors.gradientStart,
  },
  workspaceButtonText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 12 },
});
