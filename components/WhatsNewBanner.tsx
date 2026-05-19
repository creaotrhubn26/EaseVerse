import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@clerk/clerk-expo";
import Colors from "@/constants/colors";
import { authedFetch } from "@/lib/authed-fetch";

type Entry = {
  id: number;
  publishedAt: string;
  title: string;
  body: string;
  tag: string | null;
};

const LAST_SEEN_KEY = "@easeverse_changelog_last_seen_v1";

export function WhatsNewBanner({ horizontalMargin = 16 }: { horizontalMargin?: number }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const response = await authedFetch("/api/changelog?limit=1", token, { method: "GET" });
        if (!response.ok) return;
        const data = (await response.json()) as { entries: Entry[] };
        const latest = data.entries[0] ?? null;
        if (!latest) return;
        const lastSeenRaw = await AsyncStorage.getItem(LAST_SEEN_KEY);
        const lastSeen = lastSeenRaw ? parseInt(lastSeenRaw, 10) : 0;
        if (latest.id > lastSeen) {
          if (!cancelled) setEntry(latest);
        }
      } catch {
        // Ignore.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken]);

  if (!entry) return null;

  async function dismiss() {
    if (!entry) return;
    try {
      await AsyncStorage.setItem(LAST_SEEN_KEY, String(entry.id));
    } catch {
      // Ignore.
    }
    setEntry(null);
  }

  return (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
      style={[styles.banner, { marginHorizontal: horizontalMargin }]}
      accessibilityRole="button"
      accessibilityLabel={expanded ? "Hide what's new" : "Show what's new"}
      accessibilityState={{ expanded }}
    >
      <View style={styles.row}>
        <Ionicons name="sparkles" size={16} color={Colors.gradientMid} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>
            {entry.tag ? `${entry.tag.toUpperCase()} · ` : ""}What&apos;s new
          </Text>
          <Text style={styles.title} numberOfLines={expanded ? undefined : 1}>
            {entry.title}
          </Text>
        </View>
        <Pressable
          onPress={dismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Dismiss what's new"
        >
          <Ionicons name="close" size={14} color={Colors.textSecondary} />
        </Pressable>
      </View>
      {expanded ? <Text style={styles.body}>{entry.body}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.gradientMid + "44",
    gap: 6,
    zIndex: 50,
    elevation: 6,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  label: {
    color: Colors.gradientMid,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.6,
  },
  title: {
    color: Colors.textPrimary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    marginTop: 1,
  },
  body: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
});
