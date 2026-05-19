import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

type Props = { horizontalMargin?: number };

type PairingResponse = {
  token: string;
  expiresAt: string;
  ttlSeconds: number;
  usage: string;
};

export function ProToolsPairingCard({ horizontalMargin = 16 }: Props) {
  const [pairing, setPairing] = useState<PairingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest("POST", "/api/v1/companion/pairing", {});
      if (!response.ok) {
        throw new Error(`Failed: ${response.status}`);
      }
      const data = (await response.json()) as PairingResponse;
      setPairing(data);
      setCopied(false);
    } catch (err) {
      setError((err as Error).message || "Pairing failed");
    } finally {
      setLoading(false);
    }
  }

  function copyCommand() {
    if (!pairing) return;
    const cmd = `export EASEVERSE_API_KEY=${pairing.token} && npm run companion:dev`;
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(cmd).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        },
        () => setError("Clipboard write failed"),
      );
    } else {
      setError("Copy is web-only — please copy manually.");
    }
  }

  return (
    <View style={[styles.card, { marginHorizontal: horizontalMargin }]}>
      <View style={styles.headerRow}>
        <Ionicons name="git-network" size={18} color={Colors.gradientMid} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Pro Tools companion</Text>
          <Text style={styles.subtitle}>
            Generate a short-lived token, then run the companion CLI with it.
          </Text>
        </View>
      </View>

      {pairing ? (
        <View style={styles.tokenBox}>
          <Text style={styles.tokenLabel}>Token (expires in {Math.round(pairing.ttlSeconds / 60)} min)</Text>
          <Text style={styles.tokenValue} selectable>
            {pairing.token}
          </Text>
          <Text style={styles.commandHint}>
            export EASEVERSE_API_KEY={pairing.token} && npm run companion:dev
          </Text>
          <View style={styles.row}>
            <Pressable
              onPress={copyCommand}
              style={styles.secondaryBtn}
              accessibilityRole="button"
              accessibilityLabel="Copy companion command"
            >
              <Ionicons name={copied ? "checkmark" : "copy-outline"} size={14} color={Colors.textPrimary} />
              <Text style={styles.secondaryBtnText}>{copied ? "Copied" : "Copy"}</Text>
            </Pressable>
            <Pressable
              onPress={generate}
              style={styles.secondaryBtn}
              accessibilityRole="button"
              accessibilityLabel="Regenerate pairing token"
            >
              <Ionicons name="refresh" size={14} color={Colors.textPrimary} />
              <Text style={styles.secondaryBtnText}>New token</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={generate}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Generate Pro Tools pairing token"
        >
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd] as const}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Generate pairing code</Text>
            )}
          </LinearGradient>
        </Pressable>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        onPress={() => setShowGuide((v) => !v)}
        style={styles.guideHeader}
        accessibilityRole="button"
        accessibilityLabel={showGuide ? 'Hide setup guide' : 'Show setup guide'}
        accessibilityState={{ expanded: showGuide }}
      >
        <Ionicons
          name={showGuide ? 'chevron-down' : 'chevron-forward'}
          size={14}
          color={Colors.textSecondary}
        />
        <Text style={styles.guideHeaderText}>How to connect Pro Tools</Text>
      </Pressable>

      {showGuide ? (
        <View style={styles.guideBody}>
          <GuideStep n={1} title="Generate a token above">
            The token expires after 15 minutes. Generate a new one any time.
          </GuideStep>
          <GuideStep n={2} title="Install companion on your Mac">
            Clone the EaseVerse repo and run{` `}
            <Text style={styles.code}>npm install</Text>. The companion lives in the
            <Text style={styles.code}> companion/</Text> folder.
          </GuideStep>
          <GuideStep n={3} title="Run companion with the token">
            <Text style={styles.code}>
              export EASEVERSE_API_BASE_URL=https://easeverse.vercel.app{`\n`}
              export EASEVERSE_API_KEY=&lt;your token&gt;{`\n`}
              export PROTOOLS_SESSION_INFO_FILE=/tmp/pt-session.txt{`\n`}
              npm run companion:dev
            </Text>
          </GuideStep>
          <GuideStep n={4} title="Export from Pro Tools">
            In Pro Tools, run <Text style={styles.code}>File → Export → Session Info as Text…</Text>
            {` `}and save to the path you pointed{` `}
            <Text style={styles.code}>PROTOOLS_SESSION_INFO_FILE</Text>{` `}
            at. The companion auto-detects file changes.
          </GuideStep>
          <GuideStep n={5} title="What gets synced">
            Tempo (BPM), markers, take names, and any pronunciation feedback are
            pushed to{` `}
            <Text style={styles.code}>/api/v1/collab/protools</Text>{` `}
            and appear in your EaseVerse session list.
          </GuideStep>
          <GuideStep n={6} title="Two-way sync (optional)">
            Set{` `}
            <Text style={styles.code}>PROTOOLS_IMPORT_FILE=/tmp/pt-ingest.json</Text>
            {` `}to pull lyrics + marker updates from EaseVerse back into a JSON
            snapshot for Pro Tools-side ingestion.
          </GuideStep>
          <Text style={styles.guideNote}>
            Pairing tokens are accepted in place of EXTERNAL_API_KEY for{` `}
            <Text style={styles.code}>/api/v1/*</Text> routes. They live in
            server memory and disappear after 15 minutes or a server restart.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function GuideStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.guideStep}>
      <View style={styles.guideStepBadge}>
        <Text style={styles.guideStepBadgeText}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.guideStepTitle}>{title}</Text>
        <Text style={styles.guideStepBody}>{children}</Text>
      </View>
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
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  title: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 15 },
  subtitle: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 2 },
  primaryBtn: { paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14 },
  tokenBox: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  tokenLabel: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  tokenValue: {
    color: Colors.textPrimary,
    fontFamily: Platform.OS === "web" ? "Menlo, monospace" : "Inter_500Medium",
    fontSize: 13,
  },
  commandHint: {
    color: Colors.textSecondary,
    fontFamily: Platform.OS === "web" ? "Menlo, monospace" : "Inter_500Medium",
    fontSize: 11,
  },
  row: { flexDirection: "row", gap: 8 },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  secondaryBtnText: { color: Colors.textPrimary, fontFamily: "Inter_600SemiBold", fontSize: 12 },
  errorText: { color: Colors.dangerUnderline, fontFamily: "Inter_500Medium", fontSize: 12 },
  guideHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  guideHeaderText: {
    color: Colors.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  guideBody: {
    gap: 10,
    paddingTop: 4,
  },
  guideStep: {
    flexDirection: "row",
    gap: 10,
  },
  guideStepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.gradientStart,
  },
  guideStepBadgeText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  guideStepTitle: {
    color: Colors.textPrimary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    marginBottom: 2,
  },
  guideStepBody: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 17,
  },
  code: {
    fontFamily: Platform.OS === "web" ? "Menlo, monospace" : "Inter_500Medium",
    color: Colors.gradientStart,
    fontSize: 11,
    backgroundColor: "rgba(255,122,24,0.08)",
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  guideNote: {
    color: Colors.textTertiary,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    fontStyle: "italic",
    lineHeight: 16,
  },
});
