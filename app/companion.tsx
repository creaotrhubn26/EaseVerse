import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

type Download = {
  platform: string;
  arch: string;
  url: string;
  filename: string;
  size_mb?: number;
};

type DownloadsResponse = {
  version: string;
  downloads: Download[];
  notes: string[];
};

export default function CompanionScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<DownloadsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/companion/downloads`);
        if (res.ok) setData((await res.json()) as DownloadsResponse);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function openLink(url: string) {
    if (Platform.OS === "web") {
      window.open(url, "_blank");
    } else {
      void Linking.openURL(url);
    }
  }

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
          <Text style={styles.eyebrow}>Pro Tools companion</Text>
          <Text style={styles.title}>Download</Text>
        </View>
      </View>

      <View style={styles.intro}>
        <Text style={styles.introText}>
          The companion runs on the producer's machine. It watches the Pro Tools{" "}
          <Text style={styles.code}>Audio Files/</Text> folder and uploads each new vocal take to EaseVerse
          automatically, then writes back marker/keeper files Pro Tools can import.
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.textTertiary} />
      ) : (
        <>
          <View style={styles.platforms}>
            <PlatformCard
              icon="logo-apple"
              title="macOS"
              status={data?.downloads.find((d) => d.platform === "macOS") ? "ready" : "missing"}
              download={data?.downloads.find((d) => d.platform === "macOS")}
              onDownload={openLink}
              hint="Right-click → Open the first time (unsigned)."
            />
            <PlatformCard
              icon="logo-windows"
              title="Windows"
              status={data?.downloads.find((d) => d.platform === "Windows") ? "ready" : "pending"}
              download={data?.downloads.find((d) => d.platform === "Windows")}
              onDownload={openLink}
              hint="MSI installer — auto-builds on every companion-v* git tag once the CI workflow is pushed to GitHub."
            />
            <PlatformCard
              icon="logo-tux"
              title="Linux"
              status={data?.downloads.find((d) => d.platform === "Linux") ? "ready" : "pending"}
              download={data?.downloads.find((d) => d.platform === "Linux")}
              onDownload={openLink}
              hint="AppImage / .deb — same CI workflow."
            />
          </View>

          {data?.notes && data.notes.length > 0 ? (
            <View style={styles.notes}>
              <Text style={styles.notesLabel}>Notes</Text>
              {data.notes.map((n, i) => (
                <Text key={i} style={styles.noteItem}>• {n}</Text>
              ))}
            </View>
          ) : null}

          <Text style={styles.sectionLabel}>After installing</Text>
          <Text style={styles.step}>
            1. Go to <Text style={styles.code}>/admin</Text> and click <Text style={styles.code}>Generate pairing code</Text>.
          </Text>
          <Text style={styles.step}>
            2. Open EaseVerse Companion, paste the token, pick the Pro Tools <Text style={styles.code}>Audio Files/</Text> folder.
          </Text>
          <Text style={styles.step}>
            3. (Optional) Set Export folder so the companion writes{" "}
            <Text style={styles.code}>easeverse-markers.txt</Text> + <Text style={styles.code}>easeverse-keepers.txt</Text>{" "}
            you can import back into Pro Tools (File → Import → Session Data).
          </Text>
          <Text style={styles.step}>
            4. Click Start watching. Every new vocal take from Pro Tools auto-uploads and shows up in EaseVerse + the vocalist's booth view.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

function PlatformCard({
  icon,
  title,
  status,
  download,
  onDownload,
  hint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  status: "ready" | "pending" | "missing";
  download?: Download;
  onDownload: (url: string) => void;
  hint?: string;
}) {
  return (
    <View style={styles.platformCard}>
      <View style={styles.platformHeader}>
        <Ionicons name={icon} size={22} color={Colors.textPrimary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.platformName}>{title}</Text>
          {download ? (
            <Text style={styles.platformMeta}>
              {download.arch} · {download.filename}{download.size_mb ? ` · ${download.size_mb} MB` : ""}
            </Text>
          ) : (
            <Text style={styles.platformMeta}>
              {status === "pending" ? "Waiting for CI build" : "Not yet available"}
            </Text>
          )}
        </View>
        {download ? (
          <Pressable
            onPress={() => onDownload(download.url)}
            style={styles.downloadBtn}
            accessibilityRole="button"
            accessibilityLabel={`Download ${title} installer`}
          >
            <Ionicons name="cloud-download" size={14} color="#fff" />
            <Text style={styles.downloadBtnText}>Download</Text>
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text style={styles.platformHint}>{hint}</Text> : null}
    </View>
  );
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
  title: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 22 },
  intro: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  introText: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    lineHeight: 18,
  },
  platforms: { gap: 10 },
  platformCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 6,
  },
  platformHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  platformName: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 15 },
  platformMeta: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 2 },
  platformHint: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 11, fontStyle: "italic" },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: Colors.gradientStart,
  },
  downloadBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 12 },
  notes: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 4,
  },
  notesLabel: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  noteItem: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 16 },
  sectionLabel: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 6,
  },
  step: {
    color: Colors.textPrimary,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    lineHeight: 19,
  },
  code: {
    fontFamily: "Inter_700Bold",
    color: Colors.gradientMid,
    backgroundColor: Colors.surfaceGlass,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
});
