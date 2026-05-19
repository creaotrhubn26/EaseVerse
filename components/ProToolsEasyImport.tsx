import React, { useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
import Colors from "@/constants/colors";
import { authedFetch } from "@/lib/authed-fetch";
import { normalizeTrackId, parseProToolsSessionInfoText } from "@/lib/protools-parser";
import { CLERK_CONFIGURED } from "@/lib/use-app-user";

type Props = { horizontalMargin?: number };

export function ProToolsEasyImport(props: Props) {
  if (!CLERK_CONFIGURED) {
    return <ProToolsEasyImportAnonymous {...props} />;
  }
  return <ProToolsEasyImportAuthed {...props} />;
}

function ProToolsEasyImportAnonymous({ horizontalMargin = 16 }: Props) {
  return (
    <View style={[styles.card, { marginHorizontal: horizontalMargin }]}>
      <Text style={styles.title}>Easy import (sign in to use)</Text>
      <Text style={styles.subtitle}>
        Sign in to drop Pro Tools Session Info files and have markers + tempo
        synced into your sessions.
      </Text>
    </View>
  );
}

type Status =
  | { kind: "idle" }
  | { kind: "parsed"; markers: number; bpm?: number; sessionName?: string }
  | { kind: "uploading" }
  | { kind: "done"; markers: number; trackId: string }
  | { kind: "error"; message: string };

function ProToolsEasyImportAuthed({ horizontalMargin = 16 }: Props) {
  const { getToken, isSignedIn } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    setStatus({ kind: "uploading" });
    try {
      const text = await file.text();
      const parsed = parseProToolsSessionInfoText(text);
      setStatus({
        kind: "parsed",
        markers: parsed.markers.length,
        bpm: parsed.bpm,
        sessionName: parsed.sessionName,
      });

      if (parsed.markers.length === 0 && !parsed.bpm) {
        setStatus({
          kind: "error",
          message:
            "Could not find markers or tempo in this file. Make sure you exported via File → Export → Session Info as Text.",
        });
        return;
      }

      const trackId = normalizeTrackId(parsed.sessionName || file.name.replace(/\.[^.]+$/, ""));
      const payload = {
        externalTrackId: trackId || "pt-track-" + Date.now(),
        source: "easeverse-easy-import",
        bpm: parsed.bpm,
        markers: parsed.markers,
        updatedAt: new Date().toISOString(),
      };

      const token = isSignedIn ? await getToken() : null;
      const response = await authedFetch("/api/v1/collab/protools", token, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Server replied ${response.status}`);
      setStatus({ kind: "done", markers: parsed.markers.length, trackId: payload.externalTrackId });
    } catch (err) {
      setStatus({ kind: "error", message: (err as Error).message || "Import failed" });
    }
  }

  if (Platform.OS !== "web") {
    return (
      <View style={[styles.card, { marginHorizontal: horizontalMargin }]}>
        <Text style={styles.title}>Easy import (web only)</Text>
        <Text style={styles.subtitle}>
          Open EaseVerse in a desktop browser to drop your Pro Tools Session Info
          file here — no install needed.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { marginHorizontal: horizontalMargin }]}>
      <View style={styles.headerRow}>
        <Ionicons name="cloud-upload-outline" size={18} color={Colors.gradientMid} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Easy import — no install</Text>
          <Text style={styles.subtitle}>
            Drop a Pro Tools Session Info .txt file. Markers and tempo sync into EaseVerse instantly.
          </Text>
        </View>
      </View>

      <Pressable
        style={[styles.dropZone, dragOver && styles.dropZoneActive]}
        onPress={() => fileInputRef.current?.click()}
        accessibilityRole="button"
        accessibilityLabel="Choose Pro Tools session info file"
        // RN Web passes drag events through to underlying div via accessibilityLiveRegion props
        // but the cleanest path is to set listeners on the rendered div via a ref-callback:
        ref={(node) => {
          if (!node || typeof window === "undefined") return;
          // @ts-expect-error react-native-web emits a real DOM node
          const el = node as HTMLElement;
          el.ondragenter = (e: DragEvent) => {
            e.preventDefault();
            setDragOver(true);
          };
          el.ondragover = (e: DragEvent) => {
            e.preventDefault();
            setDragOver(true);
          };
          el.ondragleave = () => setDragOver(false);
          el.ondrop = (e: DragEvent) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer?.files?.[0];
            if (file) void handleFile(file);
          };
        }}
      >
        <Ionicons name="document-text-outline" size={28} color={Colors.textTertiary} />
        <Text style={styles.dropText}>
          {dragOver ? "Drop to import" : "Click or drop a Session Info .txt file"}
        </Text>
      </Pressable>

      {/* Hidden file input */}
      {typeof document !== "undefined" ? (
        <input
          ref={(node) => {
            fileInputRef.current = node;
          }}
          type="file"
          accept=".txt,text/plain"
          style={{ display: "none" }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = "";
          }}
        />
      ) : null}

      <View style={styles.statusArea}>
        {status.kind === "uploading" ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={Colors.textTertiary} />
            <Text style={styles.statusText}>Parsing & uploading…</Text>
          </View>
        ) : null}
        {status.kind === "parsed" ? (
          <Text style={styles.statusText}>
            Parsed{status.sessionName ? ` "${status.sessionName}"` : ""}: {status.markers} marker
            {status.markers === 1 ? "" : "s"}
            {status.bpm ? ` · ${status.bpm} BPM` : ""}
          </Text>
        ) : null}
        {status.kind === "done" ? (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.successUnderline} />
            <Text style={styles.successText}>
              Synced {status.markers} marker{status.markers === 1 ? "" : "s"} as track{" "}
              <Text style={styles.successCode}>{status.trackId}</Text>
            </Text>
          </View>
        ) : null}
        {status.kind === "error" ? <Text style={styles.errorText}>{status.message}</Text> : null}
      </View>

      <View style={styles.guideRow}>
        <Ionicons name="information-circle-outline" size={14} color={Colors.textTertiary} />
        <Text style={styles.guideText}>
          In Pro Tools: <Text style={styles.code}>File → Export → Session Info as Text…</Text>{" "}
          Save the .txt file, then drop it here. Re-export and re-drop after each
          change.
        </Text>
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
  dropZone: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.borderGlass,
    borderStyle: "dashed",
    padding: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceGlass,
    gap: 8,
  },
  dropZoneActive: {
    borderColor: Colors.gradientStart,
    backgroundColor: Colors.accentSubtle,
  },
  dropText: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 13 },
  statusArea: { minHeight: 18 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusText: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 12 },
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: Colors.successUnderline + "15",
    borderWidth: 1,
    borderColor: Colors.successUnderline + "44",
  },
  successText: { color: Colors.textPrimary, fontFamily: "Inter_500Medium", fontSize: 12, flex: 1 },
  successCode: {
    fontFamily: Platform.OS === "web" ? "Menlo, monospace" : "Inter_500Medium",
    color: Colors.successUnderline,
  },
  errorText: { color: Colors.dangerUnderline, fontFamily: "Inter_500Medium", fontSize: 12 },
  guideRow: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  guideText: { flex: 1, color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 15 },
  code: {
    fontFamily: Platform.OS === "web" ? "Menlo, monospace" : "Inter_500Medium",
    color: Colors.gradientStart,
    fontSize: 11,
  },
});

