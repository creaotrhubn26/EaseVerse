import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { CLERK_CONFIGURED } from "@/lib/use-app-user";
import {
  fetchTakeDetail,
  fetchTakes,
  updateTakeFeedback,
  uploadTake,
  type ProducerDecision,
  type TakeAnalysis,
  type TakeRecord,
} from "@/lib/takes-client";
import { formatTimestamp } from "@/lib/parse-timestamps";

type Props = { horizontalMargin?: number };

export function TakesSection(props: Props) {
  if (!CLERK_CONFIGURED) return null;
  return <TakesSectionAuthed {...props} />;
}

function TakesSectionAuthed({ horizontalMargin = 16 }: Props) {
  // Lazy-load useAuth so this module doesn't blow up when Clerk isn't installed.
  const { useAuth } = require("@clerk/clerk-expo") as typeof import("@clerk/clerk-expo");
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [takes, setTakes] = useState<TakeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reload = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const token = await getToken();
      const fetched = await fetchTakes(token);
      setTakes(fetched);
      setError(null);
    } catch (err) {
      setError((err as Error).message || "Takes fetch failed");
    } finally {
      setLoading(false);
    }
  }, [getToken, isSignedIn]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setLoading(false);
      return;
    }
    void reload();
  }, [isLoaded, isSignedIn, reload]);

  async function handleFile(file: File, externalTrackId?: string) {
    if (!isSignedIn) return;
    setUploading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Missing auth token");
      const inferredTrackId = externalTrackId || file.name.replace(/\.[^.]+$/, "").slice(0, 80);
      await uploadTake({ file, externalTrackId: inferredTrackId, token });
      // onUploadCompleted on the server creates the row + kicks off processTake.
      // Poll a bit so we surface the new row + analysis quickly.
      await reload();
      setTimeout(() => void reload(), 1500);
      setTimeout(() => void reload(), 4000);
    } catch (err) {
      setError((err as Error).message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // Poll while any take is queued or processing.
  useEffect(() => {
    if (!isSignedIn) return;
    const pending = takes.some((t) => t.status === "queued" || t.status === "processing");
    if (!pending) return;
    const interval = setInterval(() => {
      void reload();
    }, 5000);
    return () => clearInterval(interval);
  }, [isSignedIn, takes, reload]);

  if (!isSignedIn) {
    return null;
  }

  return (
    <View style={[styles.card, { marginHorizontal: horizontalMargin }]}>
      <View style={styles.headerRow}>
        <Ionicons name="albums" size={18} color={Colors.gradientMid} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Studio takes</Text>
          <Text style={styles.subtitle}>
            Drop vocal takes from Pro Tools (bounced or printed) — analysis runs in the background.
          </Text>
        </View>
      </View>

      {Platform.OS === "web" ? (
        <Pressable
          style={[styles.dropZone, dragOver && styles.dropZoneActive]}
          onPress={() => fileInputRef.current?.click()}
          accessibilityRole="button"
          accessibilityLabel="Choose audio file to upload as take"
          ref={(node) => {
            if (!node || typeof window === "undefined") return;
            // @ts-expect-error react-native-web emits DOM nodes
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
          {uploading ? (
            <ActivityIndicator color={Colors.textTertiary} />
          ) : (
            <Ionicons name="cloud-upload-outline" size={26} color={Colors.textTertiary} />
          )}
          <Text style={styles.dropText}>
            {uploading
              ? "Uploading…"
              : dragOver
                ? "Drop to upload"
                : "Click or drop a .wav / .aif / .mp3 take"}
          </Text>
          {typeof document !== "undefined" ? (
            <input
              ref={(node) => {
                fileInputRef.current = node;
              }}
              type="file"
              accept="audio/*"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.target.value = "";
              }}
            />
          ) : null}
        </Pressable>
      ) : (
        <Text style={styles.subtitle}>Open EaseVerse on web to upload takes.</Text>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.list}>
        {loading ? (
          <ActivityIndicator color={Colors.textTertiary} />
        ) : takes.length === 0 ? (
          <Text style={styles.empty}>No takes yet. Upload your first one above.</Text>
        ) : (
          takes.map((t) => (
            <TakeRow
              key={t.id}
              take={t}
              getToken={getToken}
              onTakeUpdated={(updated) =>
                setTakes((prev) => prev.map((tt) => (tt.id === updated.id ? { ...tt, ...updated } : tt)))
              }
            />
          ))
        )}
      </View>
    </View>
  );
}

function TakeRow({
  take,
  getToken,
  onTakeUpdated,
}: {
  take: TakeRecord;
  getToken: () => Promise<string | null>;
  onTakeUpdated: (updated: TakeRecord) => void;
}) {
  const [analysis, setAnalysis] = useState<TakeAnalysis | null>(null);
  const [noteDraft, setNoteDraft] = useState(take.producerNote ?? "");
  const [noteDirty, setNoteDirty] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [decisionUpdating, setDecisionUpdating] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const noteSelectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  function insertTimestampAtCursor() {
    const seconds = audioRef.current?.currentTime ?? 0;
    const stamp = `@${formatTimestamp(seconds)} `;
    const { start, end } = noteSelectionRef.current;
    const next = noteDraft.slice(0, start) + stamp + noteDraft.slice(end);
    setNoteDraft(next);
    setNoteDirty(next !== (take.producerNote ?? ""));
  }

  useEffect(() => {
    if (!noteDirty) setNoteDraft(take.producerNote ?? "");
  }, [noteDirty, take.producerNote]);

  async function saveNote() {
    if (!noteDirty) return;
    setSavingNote(true);
    try {
      const token = await getToken();
      const updated = await updateTakeFeedback(token, take.id, { producerNote: noteDraft });
      onTakeUpdated(updated);
      setNoteDirty(false);
    } catch (err) {
      console.warn("save note failed:", err);
    } finally {
      setSavingNote(false);
    }
  }

  async function setDecision(next: ProducerDecision | "clear") {
    setDecisionUpdating(true);
    try {
      const token = await getToken();
      const updated = await updateTakeFeedback(token, take.id, { producerDecision: next });
      onTakeUpdated(updated);
    } catch (err) {
      console.warn("decision update failed:", err);
    } finally {
      setDecisionUpdating(false);
    }
  }
  const statusColor =
    take.status === "done"
      ? Colors.successUnderline
      : take.status === "error"
        ? Colors.dangerUnderline
        : Colors.gradientMid;

  useEffect(() => {
    if (take.status !== "done") return;
    if (analysis) return;
    let cancelled = false;
    (async () => {
      const token = await getToken();
      const detail = await fetchTakeDetail(token, take.id);
      if (!cancelled) setAnalysis(detail?.analysis ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [take.status, take.id, analysis, getToken]);

  const [boothCopied, setBoothCopied] = useState(false);

  function copyBoothUrl() {
    if (!take.externalTrackId) return;
    if (Platform.OS !== "web" || typeof window === "undefined" || !navigator.clipboard) return;
    const url = `${window.location.origin}/booth/${encodeURIComponent(take.externalTrackId)}`;
    void navigator.clipboard.writeText(url).then(
      () => {
        setBoothCopied(true);
        setTimeout(() => setBoothCopied(false), 1500);
      },
      () => undefined,
    );
  }

  return (
    <View style={styles.takeRow}>
      <View style={styles.takeRowHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.takeName} numberOfLines={1}>
            {take.filename}
          </Text>
          <Text style={styles.takeMeta}>
            {take.externalTrackId ? `${take.externalTrackId} · ` : ""}
            {take.byteSize ? `${(take.byteSize / 1024 / 1024).toFixed(1)} MB · ` : ""}
            {take.durationSec ? `${take.durationSec.toFixed(1)}s · ` : ""}
            {new Date(take.uploadedAt).toLocaleString()}
          </Text>
        </View>
        {take.externalTrackId && Platform.OS === "web" ? (
          <Pressable
            onPress={copyBoothUrl}
            style={styles.boothBtn}
            accessibilityRole="button"
            accessibilityLabel="Copy vocalist booth URL"
          >
            <Ionicons
              name={boothCopied ? "checkmark" : "link"}
              size={13}
              color={Colors.textPrimary}
            />
            <Text style={styles.boothBtnText}>{boothCopied ? "Copied" : "Booth URL"}</Text>
          </Pressable>
        ) : null}
        <View style={[styles.statusPill, { borderColor: statusColor + "55" }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{take.status}</Text>
        </View>
      </View>
      {take.status === "error" && take.errorMessage ? (
        <Text style={styles.analysisError}>{take.errorMessage}</Text>
      ) : null}
      {analysis ? (
        <View style={styles.analysisBox}>
          <View style={styles.analysisStats}>
            {analysis.pitchMeanHz ? (
              <Text style={styles.statText}>Pitch {analysis.pitchMeanHz.toFixed(0)} Hz</Text>
            ) : null}
            {analysis.pitchStddevCents !== null ? (
              <Text style={styles.statText}>±{analysis.pitchStddevCents}¢</Text>
            ) : null}
            {analysis.energyAvgDb !== null ? (
              <Text style={styles.statText}>{analysis.energyAvgDb} dB</Text>
            ) : null}
            {analysis.timingScore !== null ? (
              <Text style={styles.statText}>Timing {analysis.timingScore}/100</Text>
            ) : null}
            {analysis.pronunciationScore !== null ? (
              <Text style={styles.statText}>Pronunciation {analysis.pronunciationScore}/100</Text>
            ) : null}
          </View>
          {analysis.aiNotes ? (
            <Text style={styles.analysisNotes}>{analysis.aiNotes}</Text>
          ) : null}
          {analysis.transcript ? (
            <Text style={styles.analysisTranscript} numberOfLines={2}>
              &ldquo;{analysis.transcript}&rdquo;
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.producerBox}>
        <View style={styles.decisionRow}>
          <DecisionChip
            active={take.producerDecision === "keeper"}
            label="Keeper"
            color={Colors.successUnderline}
            onPress={() =>
              setDecision(take.producerDecision === "keeper" ? "clear" : "keeper")
            }
            disabled={decisionUpdating}
          />
          <DecisionChip
            active={take.producerDecision === "redo"}
            label="Re-do"
            color={Colors.dangerUnderline}
            onPress={() =>
              setDecision(take.producerDecision === "redo" ? "clear" : "redo")
            }
            disabled={decisionUpdating}
          />
          {Platform.OS === "web" ? (
            <Pressable
              onPress={insertTimestampAtCursor}
              style={styles.timestampBtn}
              accessibilityRole="button"
              accessibilityLabel="Insert current audio time into note"
            >
              <Ionicons name="time-outline" size={12} color={Colors.gradientMid} />
              <Text style={styles.timestampBtnText}>Insert time</Text>
            </Pressable>
          ) : null}
        </View>
        {Platform.OS === "web" && take.storageUrl && take.status === "done" ? (
          <audio
            ref={(node) => {
              audioRef.current = node;
            }}
            controls
            preload="none"
            src={take.storageUrl}
            style={{ width: "100%", height: 28 }}
          />
        ) : null}
        <TextInput
          value={noteDraft}
          onChangeText={(t) => {
            setNoteDraft(t);
            setNoteDirty(t !== (take.producerNote ?? ""));
          }}
          onSelectionChange={(e) => {
            const sel = e.nativeEvent.selection;
            if (sel) noteSelectionRef.current = { start: sel.start, end: sel.end };
          }}
          onBlur={saveNote}
          placeholder='Producer note — e.g. "@1:23 mer pust her" (tap a timestamp to jump in playback)'
          placeholderTextColor={Colors.textTertiary}
          style={styles.producerNoteInput}
          multiline
          maxLength={1000}
          accessibilityLabel="Producer note for vocalist"
        />
        {noteDirty || savingNote ? (
          <Text style={styles.noteHint}>{savingNote ? "Saving…" : "Edited — tap away to save"}</Text>
        ) : null}
      </View>
    </View>
  );
}

function DecisionChip({
  active,
  label,
  color,
  onPress,
  disabled,
}: {
  active: boolean;
  label: string;
  color: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.decisionChip,
        active && { borderColor: color, backgroundColor: color + "22" },
        disabled && { opacity: 0.5 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Mark take ${label}`}
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.decisionChipText, active && { color }]}>{label}</Text>
    </Pressable>
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
    borderStyle: "dashed",
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    padding: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  dropZoneActive: { borderColor: Colors.gradientStart, backgroundColor: Colors.accentSubtle },
  dropText: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 13 },
  list: { gap: 8 },
  empty: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 12, fontStyle: "italic" },
  error: { color: Colors.dangerUnderline, fontFamily: "Inter_500Medium", fontSize: 12 },
  takeRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 8,
  },
  takeRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  analysisBox: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderGlass,
    gap: 6,
  },
  analysisStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statText: {
    color: Colors.gradientMid,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(255,145,77,0.12)",
  },
  analysisNotes: {
    color: Colors.textPrimary,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 17,
  },
  analysisTranscript: {
    color: Colors.textTertiary,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    fontStyle: "italic",
  },
  analysisError: {
    color: Colors.dangerUnderline,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  takeName: { color: Colors.textPrimary, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  takeMeta: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 2 },
  boothBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surface,
  },
  boothBtnText: {
    color: Colors.textPrimary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  producerBox: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderGlass,
    gap: 8,
  },
  decisionRow: {
    flexDirection: "row",
    gap: 8,
  },
  decisionChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surface,
  },
  decisionChipText: {
    color: Colors.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  producerNoteInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: Colors.textPrimary,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    minHeight: 38,
  },
  noteHint: {
    color: Colors.textTertiary,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    fontStyle: "italic",
  },
  timestampBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Colors.gradientMid + "55",
    backgroundColor: Colors.surface,
    marginLeft: "auto",
  },
  timestampBtnText: {
    color: Colors.gradientMid,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: "Inter_700Bold", fontSize: 11, textTransform: "uppercase" },
});
