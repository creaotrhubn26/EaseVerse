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
import { authedFetch } from "@/lib/authed-fetch";
import { CLERK_CONFIGURED } from "@/lib/use-app-user";

type Props = {
  horizontalMargin?: number;
  getToken?: () => Promise<string | null>;
};

type PairingResponse = {
  token: string;
  expiresAt: string;
  ttlSeconds: number;
  usage: string;
};

export function ProToolsPairingCard(props: Props) {
  if (props.getToken) {
    return <PairingCardInner {...props} getToken={props.getToken} />;
  }
  if (!CLERK_CONFIGURED) return null;
  return <PairingCardWithAuth {...props} />;
}

function PairingCardWithAuth(props: Omit<Props, "getToken">) {
  const { useAuth } = require("@clerk/clerk-expo") as typeof import("@clerk/clerk-expo");
  const { getToken } = useAuth();
  return <PairingCardInner {...props} getToken={getToken} />;
}

function PairingCardInner({ horizontalMargin = 16, getToken }: Props & { getToken: () => Promise<string | null> }) {
  const [pairing, setPairing] = useState<PairingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const response = await authedFetch("/api/companion/pairing", token, {
        method: "POST",
        body: JSON.stringify({}),
      });
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
    const cmd = `export EASEVERSE_PAIR_TOKEN=${pairing.token} && npm run companion:dev`;
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
            export EASEVERSE_PAIR_TOKEN={pairing.token} && npm run companion:dev
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
          <GuideStep n={1} title="Download the Companion app">
            Mac DMG is live; Windows/Linux installers come from CI. Visit{` `}
            <Text style={styles.code}>Profile → Get the Companion App</Text>.
          </GuideStep>
          <GuideStep n={2} title="Generate a token above">
            Paste it into the Companion's "Pairing token" field. Token expires after 15 min.
          </GuideStep>
          <GuideStep n={3} title="Pick your Pro Tools Audio Files folder">
            Companion polls it for new vocal takes and uploads each one to EaseVerse automatically.
          </GuideStep>
          <GuideStep n={4} title="Producer + band collaborate in EaseVerse">
            Open the take, leave notes (with{` `}
            <Text style={styles.code}>@1:23</Text>{` `}timestamps), record a voice memo, draw loop-punch
            regions, set Keeper/Re-do, and let the band vote — everything streams to the
            vocalist's booth view in seconds.
          </GuideStep>
          <GuideStep n={5} title="Optional: import markers + keepers back into Pro Tools">
            Set{` `}
            <Text style={styles.code}>PROTOOLS_EXPORT_DIR</Text>{` `}in the Companion
            and it writes{` `}
            <Text style={styles.code}>easeverse-markers.txt</Text>{` `}+{` `}
            <Text style={styles.code}>easeverse-keepers.txt</Text>. Import via{` `}
            <Text style={styles.code}>File → Import → Session Data</Text>.
          </GuideStep>
          <GuideStep n={6} title="Optional: comp takes inside EaseVerse">
            Open a take in Studio takes and click "Open in comping" to pick best
            sections across multiple takes. The plan exports back to Pro Tools as markers.
          </GuideStep>
          <Text style={styles.guideNote}>
            Pairing tokens are scoped to your user and accepted by{` `}
            <Text style={styles.code}>/api/takes/upload</Text>. They expire
            after 15 minutes — generate a new one any time.
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
