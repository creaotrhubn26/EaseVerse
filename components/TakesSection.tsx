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
  fetchVoteTally,
  lockDecision,
  unlockDecision,
  updateTakeFeedback,
  uploadProducerMemo,
  uploadTake,
  type ProducerDecision,
  type TakeAnalysis,
  type TakeRecord,
} from "@/lib/takes-client";
import { formatTimestamp, parseProducerNote } from "@/lib/parse-timestamps";
import { listProjects, type ProjectListItem } from "@/lib/projects-client";
import { TakeWaveform, type TakeWaveformHandle } from "@/components/TakeWaveform";
import {
  createRegion,
  deleteRegion,
  listRegions,
  type TakeRegion,
} from "@/lib/takes-client";
import { useApp } from "@/lib/AppContext";
import { createComp, listComps } from "@/lib/takes-client";
import { router } from "expo-router";

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
  const [projects, setProjectsList] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { activeSong } = useApp();

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
    void (async () => {
      try {
        const token = await getToken();
        const list = await listProjects(token);
        setProjectsList(list);
      } catch {
        /* ignore */
      }
    })();
  }, [isLoaded, isSignedIn, reload, getToken]);

  async function handleFile(file: File, externalTrackId?: string) {
    if (!isSignedIn) return;
    setUploading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Missing auth token");
      const inferredTrackId = externalTrackId || file.name.replace(/\.[^.]+$/, "").slice(0, 80);
      await uploadTake({
        file,
        externalTrackId: inferredTrackId,
        token,
        projectId: selectedProjectId || undefined,
        lyricsSnapshot: activeSong?.lyrics || undefined,
      });
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

      {Platform.OS === "web" && projects.length > 0 ? (
        <View style={styles.projectPickerRow}>
          <Text style={styles.projectPickerLabel}>Project:</Text>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            style={{
              flex: 1,
              padding: "6px 8px",
              borderRadius: 7,
              border: "1px solid #262833",
              background: "#1a1c25",
              color: "#f3f4f8",
              font: "12px Inter, sans-serif",
            }}
          >
            <option value="">(All takes — no project)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </View>
      ) : null}
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
        {(() => {
          const filtered = selectedProjectId
            ? takes.filter((t) => t.projectId === selectedProjectId)
            : takes;
          if (loading) return <ActivityIndicator color={Colors.textTertiary} />;
          if (filtered.length === 0)
            return (
              <Text style={styles.empty}>
                {selectedProjectId
                  ? "No takes in this project yet."
                  : "No takes yet. Upload your first one above."}
              </Text>
            );
          return filtered.map((t) => (
            <TakeRow
              key={t.id}
              take={t}
              getToken={getToken}
              onTakeUpdated={(updated) =>
                setTakes((prev) => prev.map((tt) => (tt.id === updated.id ? { ...tt, ...updated } : tt)))
              }
            />
          ));
        })()}
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
  const waveformRef = useRef<TakeWaveformHandle | null>(null);
  const currentTimeRef = useRef<number>(0);
  const noteSelectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const memoRecorderRef = useRef<MediaRecorder | null>(null);
  const memoChunksRef = useRef<BlobPart[]>([]);
  const memoStartRef = useRef<number>(0);
  const memoStreamRef = useRef<MediaStream | null>(null);
  const [memoRecording, setMemoRecording] = useState(false);
  const [memoElapsedMs, setMemoElapsedMs] = useState(0);
  const [memoUploading, setMemoUploading] = useState(false);
  const memoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [tally, setTally] = useState<{ agree: number; disagree: number; disagreeComments: string[] }>({
    agree: 0,
    disagree: 0,
    disagreeComments: [],
  });
  const [lockBusy, setLockBusy] = useState(false);
  const [regions, setRegions] = useState<TakeRegion[]>([]);
  const [pendingRegion, setPendingRegion] = useState<{ start: number; end: number } | null>(null);
  const [regionLabel, setRegionLabel] = useState("");
  const [regionBusy, setRegionBusy] = useState(false);

  useEffect(() => {
    if (take.status !== "done") return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        const list = await listRegions(token, take.id);
        if (!cancelled) setRegions(list);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [take.id, take.status, getToken]);

  async function saveRegion() {
    if (!pendingRegion) return;
    setRegionBusy(true);
    try {
      const token = await getToken();
      const created = await createRegion(token, take.id, {
        startSec: pendingRegion.start,
        endSec: pendingRegion.end,
        label: regionLabel.trim() || undefined,
      });
      setRegions((prev) => [...prev, created].sort((a, b) => a.startSec - b.startSec));
      setPendingRegion(null);
      setRegionLabel("");
    } catch (err) {
      console.warn("create region failed:", err);
    } finally {
      setRegionBusy(false);
    }
  }

  async function removeRegion(id: string) {
    try {
      const token = await getToken();
      await deleteRegion(token, id);
      setRegions((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.warn("delete region failed:", err);
    }
  }

  useEffect(() => {
    if (!take.producerDecision) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        const t = await fetchVoteTally(token, take.id);
        if (cancelled) return;
        setTally({
          agree: t.agree,
          disagree: t.disagree,
          disagreeComments: t.votes.filter((v) => v.vote === "disagree" && v.comment).map((v) => v.comment!),
        });
      } catch {
        // Ignore tally errors.
      }
    })();
    const interval = setInterval(() => {
      void (async () => {
        try {
          const token = await getToken();
          const t = await fetchVoteTally(token, take.id);
          if (cancelled) return;
          setTally({
            agree: t.agree,
            disagree: t.disagree,
            disagreeComments: t.votes.filter((v) => v.vote === "disagree" && v.comment).map((v) => v.comment!),
          });
        } catch {
          /* ignore */
        }
      })();
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [take.producerDecision, take.id, getToken]);

  async function toggleLock() {
    setLockBusy(true);
    try {
      const token = await getToken();
      const fn = take.decisionLockedAt ? unlockDecision : lockDecision;
      const updated = await fn(token, take.id);
      onTakeUpdated(updated);
    } catch (err) {
      console.warn("lock toggle failed:", err);
    } finally {
      setLockBusy(false);
    }
  }

  const totalVotes = tally.agree + tally.disagree;
  const disagreePct = totalVotes > 0 ? (tally.disagree / totalVotes) * 100 : 0;

  useEffect(() => () => {
    if (memoTimerRef.current) clearInterval(memoTimerRef.current);
    memoStreamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  async function startMemoRecording() {
    if (memoRecording || memoUploading) return;
    if (Platform.OS !== "web" || typeof navigator === "undefined" || !navigator.mediaDevices) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      memoStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      memoChunksRef.current = [];
      memoStartRef.current = Date.now();
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) memoChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const elapsedMs = Date.now() - memoStartRef.current;
        const durationSec = elapsedMs / 1000;
        const blob = new Blob(memoChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        memoStreamRef.current?.getTracks().forEach((t) => t.stop());
        memoStreamRef.current = null;
        if (blob.size < 1000) return;
        setMemoUploading(true);
        try {
          const token = await getToken();
          if (!token) throw new Error("missing auth token");
          await uploadProducerMemo({ takeId: take.id, blob, durationSec, token });
          setTimeout(async () => {
            const token2 = await getToken();
            const fresh = await fetchTakeDetail(token2, take.id);
            if (fresh) onTakeUpdated(fresh);
          }, 1500);
        } catch (err) {
          console.warn("memo upload failed:", err);
        } finally {
          setMemoUploading(false);
        }
      };
      recorder.start();
      memoRecorderRef.current = recorder;
      setMemoRecording(true);
      setMemoElapsedMs(0);
      memoTimerRef.current = setInterval(() => setMemoElapsedMs(Date.now() - memoStartRef.current), 100);
    } catch (err) {
      console.warn("getUserMedia failed:", err);
    }
  }

  function stopMemoRecording() {
    if (!memoRecording) return;
    setMemoRecording(false);
    if (memoTimerRef.current) {
      clearInterval(memoTimerRef.current);
      memoTimerRef.current = null;
    }
    memoRecorderRef.current?.stop();
    memoRecorderRef.current = null;
  }

  function insertTimestampAtCursor() {
    const seconds = currentTimeRef.current || audioRef.current?.currentTime || 0;
    const stamp = `@${formatTimestamp(seconds)} `;
    const { start, end } = noteSelectionRef.current;
    const next = noteDraft.slice(0, start) + stamp + noteDraft.slice(end);
    setNoteDraft(next);
    setNoteDirty(next !== (take.producerNote ?? ""));
  }

  const noteMarkers = parseProducerNote(take.producerNote)
    .filter((s): s is { kind: "timestamp"; raw: string; seconds: number } => s.kind === "timestamp")
    .map((s) => ({ seconds: s.seconds, label: s.raw, color: Colors.gradientMid }));

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
          <>
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
            <Pressable
              onPress={async () => {
                if (!take.externalTrackId) return;
                try {
                  const token = await getToken();
                  const existing = await listComps(token, take.externalTrackId);
                  const comp = existing[0]
                    ? existing[0]
                    : await createComp(token, {
                        name: `${take.externalTrackId} comp`,
                        externalTrackId: take.externalTrackId,
                        projectId: take.projectId || undefined,
                      });
                  router.push({ pathname: "/comp/[id]", params: { id: comp.id } });
                } catch (err) {
                  console.warn("open comp failed:", err);
                }
              }}
              style={styles.boothBtn}
              accessibilityRole="button"
              accessibilityLabel="Open comp editor"
            >
              <Ionicons name="cut" size={13} color={Colors.textPrimary} />
              <Text style={styles.boothBtnText}>Comp</Text>
            </Pressable>
          </>
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
          {Platform.OS === "web" && typeof navigator !== "undefined" && navigator.mediaDevices ? (
            <Pressable
              onPress={memoRecording ? stopMemoRecording : startMemoRecording}
              disabled={memoUploading}
              style={[styles.memoBtn, memoRecording && styles.memoBtnRecording]}
              accessibilityRole="button"
              accessibilityLabel={memoRecording ? "Stop voice memo" : "Record voice memo"}
            >
              <Ionicons
                name={memoRecording ? "stop-circle" : "mic"}
                size={12}
                color={memoRecording ? "#fff" : Colors.dangerUnderline}
              />
              <Text
                style={[
                  styles.memoBtnText,
                  memoRecording && { color: "#fff" },
                ]}
              >
                {memoUploading
                  ? "Sending…"
                  : memoRecording
                    ? `Rec ${(memoElapsedMs / 1000).toFixed(1)}s`
                    : take.producerMemoUrl
                      ? "Re-record"
                      : "Memo"}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {take.producerMemoUrl && !memoRecording && Platform.OS === "web" ? (
          <audio
            controls
            preload="none"
            src={take.producerMemoUrl}
            style={{ width: "100%", height: 28, marginTop: 2 }}
          />
        ) : null}
        {Platform.OS === "web" && take.storageUrl && take.status === "done" ? (
          <TakeWaveform
            ref={waveformRef}
            audioUrl={take.storageUrl}
            markers={noteMarkers}
            regions={regions.map((r) => ({
              start: r.startSec,
              end: r.endSec,
              label: r.label ?? undefined,
              color: r.color ?? Colors.gradientStart,
            }))}
            height={48}
            enableDragCreate
            onRegionDrawn={(start, end) => {
              setPendingRegion({ start, end });
              setRegionLabel("");
            }}
            onSeek={(s) => {
              currentTimeRef.current = s;
            }}
          />
        ) : null}
        {pendingRegion ? (
          <View style={styles.regionPrompt}>
            <Text style={styles.regionPromptLabel}>
              New region · {formatTimestamp(pendingRegion.start)} → {formatTimestamp(pendingRegion.end)}
            </Text>
            <TextInput
              value={regionLabel}
              onChangeText={setRegionLabel}
              placeholder="Label (e.g. 'Chorus 2 — kjør igjen')"
              placeholderTextColor={Colors.textTertiary}
              style={styles.producerNoteInput}
              autoFocus
              maxLength={80}
            />
            <View style={{ flexDirection: "row", gap: 6, justifyContent: "flex-end" }}>
              <Pressable onPress={() => setPendingRegion(null)} style={styles.voteBtn}>
                <Text style={styles.voteBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveRegion}
                disabled={regionBusy}
                style={[styles.voteBtn, !regionBusy && styles.voteBtnActive]}
              >
                <Text style={[styles.voteBtnText, !regionBusy && { color: Colors.gradientStart }]}>
                  {regionBusy ? "…" : "Save region"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {regions.length > 0 ? (
          <View style={styles.regionList}>
            {regions.map((r) => (
              <View key={r.id} style={styles.regionRow}>
                <Text style={styles.regionLabel} numberOfLines={1}>
                  {r.label || "(no label)"} · {formatTimestamp(r.startSec)}–{formatTimestamp(r.endSec)}
                </Text>
                <Pressable
                  onPress={() => waveformRef.current?.loopRegion(r.startSec, r.endSec)}
                  style={styles.regionBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Loop region"
                >
                  <Ionicons name="repeat" size={11} color={Colors.gradientStart} />
                  <Text style={styles.regionBtnText}>Loop</Text>
                </Pressable>
                <Pressable
                  onPress={() => removeRegion(r.id)}
                  style={styles.regionBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Delete region"
                >
                  <Ionicons name="trash" size={11} color={Colors.dangerUnderline} />
                </Pressable>
              </View>
            ))}
            <Pressable
              onPress={() => waveformRef.current?.clearLoop()}
              style={[styles.regionBtn, { alignSelf: "flex-start" }]}
              accessibilityRole="button"
              accessibilityLabel="Stop looping"
            >
              <Text style={[styles.regionBtnText, { color: Colors.textSecondary }]}>Stop loop</Text>
            </Pressable>
          </View>
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
        {take.producerDecision ? (
          <View style={styles.consensusBox}>
            <View style={styles.consensusHeader}>
              <Text style={styles.consensusText}>
                Band: 👍 {tally.agree} · 👎 {tally.disagree}
                {take.decisionLockedAt ? "  ·  🔒 Locked" : ""}
              </Text>
              <Pressable
                onPress={toggleLock}
                disabled={lockBusy}
                style={[styles.lockBtn, take.decisionLockedAt && styles.lockBtnUnlock]}
                accessibilityRole="button"
                accessibilityLabel={take.decisionLockedAt ? "Unlock decision" : "Lock decision"}
              >
                <Text style={styles.lockBtnText}>
                  {lockBusy ? "…" : take.decisionLockedAt ? "Unlock" : "Lock"}
                </Text>
              </Pressable>
            </View>
            {totalVotes > 0 && disagreePct >= 30 && !take.decisionLockedAt ? (
              <Text style={styles.consensusWarning}>
                ⚠ {Math.round(disagreePct)}% disagree — review before locking
              </Text>
            ) : null}
            {tally.disagreeComments.length > 0 ? (
              <View style={{ gap: 2 }}>
                {tally.disagreeComments.slice(0, 3).map((c, i) => (
                  <Text key={i} style={styles.disagreeComment} numberOfLines={2}>
                    “{c}”
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
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
  memoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Colors.dangerUnderline + "55",
    backgroundColor: Colors.surface,
  },
  memoBtnRecording: {
    backgroundColor: Colors.dangerUnderline,
    borderColor: Colors.dangerUnderline,
  },
  memoBtnText: {
    color: Colors.dangerUnderline,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  projectPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  projectPickerLabel: {
    color: Colors.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  regionPrompt: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.gradientStart + "55",
    gap: 6,
  },
  regionPromptLabel: {
    color: Colors.gradientStart,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  regionList: {
    marginTop: 8,
    gap: 4,
  },
  regionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  regionLabel: {
    flex: 1,
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  regionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surface,
  },
  regionBtnText: {
    color: Colors.gradientStart,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
  },
  voteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surface,
  },
  voteBtnActive: {
    borderColor: Colors.gradientStart,
    backgroundColor: Colors.gradientStart + "1c",
  },
  voteBtnText: {
    color: Colors.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  consensusBox: {
    marginTop: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 4,
  },
  consensusHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  consensusText: {
    color: Colors.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    flex: 1,
  },
  lockBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.gradientStart,
  },
  lockBtnUnlock: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  lockBtnText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  consensusWarning: {
    color: Colors.gradientMid,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  disagreeComment: {
    color: Colors.textTertiary,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    fontStyle: "italic",
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
