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
import { AUTH_CONFIGURED } from "@/lib/use-app-user";
import { useAuth } from "@/lib/creatorhub-auth";
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
  createRegion,
  deleteRegion,
  listRegions,
  type TakeRegion,
  createComp,
  listComps,
} from "@/lib/takes-client";
import { formatTimestamp, parseProducerNote } from "@/lib/parse-timestamps";
import { listProjects, type ProjectListItem } from "@/lib/projects-client";
import { TakeWaveform, type TakeWaveformHandle } from "@/components/TakeWaveform";
import {
  UniversalAudioPlayer,
  type UniversalAudioPlayerHandle,
} from "@/components/UniversalAudioPlayer";
import { useApp } from "@/lib/AppContext";
import { router } from "expo-router";

type Props = { horizontalMargin?: number; collapsible?: boolean };

export function TakesSection(props: Props) {
  if (!AUTH_CONFIGURED) return null;
  return <TakesSectionAuthed {...props} />;
}

function TakesSectionAuthed({ horizontalMargin = 16, collapsible = false }: Props) {
  const { getToken, isLoaded, isSignedIn, user, signIn, isSigningIn } = useAuth();
  const [signInError, setSignInError] = useState<string | null>(null);
  const userId = user?.id;
  const accountRef = useRef(userId);
  accountRef.current = userId;
  const [expanded, setExpanded] = useState(false);
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
      if (accountRef.current !== userId) return;
      setTakes(fetched);
      setError(null);
    } catch (err) {
      if (accountRef.current !== userId) return;
      setError((err as Error).message || "Takes fetch failed");
    } finally {
      if (accountRef.current === userId) setLoading(false);
    }
  }, [getToken, isSignedIn, userId]);

  useEffect(() => {
    if (!isLoaded) return;
    let current = true;
    setTakes([]);
    setProjectsList([]);
    setSelectedProjectId('');
    setError(null);
    setExpanded(false);
    setLoading(isSignedIn);
    if (!isSignedIn) {
      setLoading(false);
      return;
    }
    void reload();
    void (async () => {
      try {
        const token = await getToken();
        const list = await listProjects(token);
        if (current) setProjectsList(list);
      } catch {
        /* ignore */
      }
    })();
    return () => { current = false; };
  }, [isLoaded, isSignedIn, reload, getToken, userId]);

  async function handleFile(file: File, externalTrackId?: string) {
    if (!isSignedIn) return;
    setUploading(true);
    setError(null);
    try {
      const token = await getToken();
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
    if (!isLoaded) return null;
    return <View style={[styles.card, { marginHorizontal: horizontalMargin }]}>
      <Text style={styles.title}>Studio takes</Text>
      <Text accessibilityRole="alert" style={styles.error}>Sign in to open your private studio recordings.</Text>
      {signInError ? <Text accessibilityRole="alert" style={styles.error}>{signInError}</Text> : null}
      <Pressable disabled={isSigningIn} accessibilityRole="button" accessibilityLabel="Sign in to open studio recordings" style={styles.retryButton}
        onPress={() => { setSignInError(null); void signIn('/sessions').catch(error => setSignInError(error instanceof Error ? error.message : 'Could not sign in. Try again.')); }}>
        <Text style={styles.boothBtnText}>{isSigningIn ? 'Opening sign-in…' : 'Continue with CreatorHub'}</Text>
      </Pressable>
    </View>;
  }

  return (
    <View style={[styles.card, { marginHorizontal: horizontalMargin }]}>
      <Pressable style={[styles.headerRow, {minHeight: 52}]}
        disabled={!collapsible} accessibilityRole={collapsible ? 'button' : undefined}
        accessibilityLabel={collapsible ? 'Studio takes' : undefined}
        accessibilityState={collapsible ? {expanded} : undefined} aria-expanded={collapsible ? expanded : undefined}
        onPress={() => setExpanded(value => !value)}>
        <Ionicons name="albums" size={18} color={Colors.gradientMid} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Studio takes</Text>
          <Text style={styles.subtitle}>
            {collapsible
              ? loading ? 'Loading studio recordings…' : error ? 'Could not load studio recordings' : `${takes.length} ${takes.length === 1 ? 'take' : 'takes'} from your studio projects`
              : 'Review recordings shared through your studio projects.'}
          </Text>
        </View>
        {collapsible && <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.gradientMid} />}
      </Pressable>

      {(!collapsible || expanded) && <>

      {Platform.OS === "web" && projects.length > 0 ? (
        <View style={styles.projectPickerRow}>
          <Text style={styles.projectPickerLabel}>Project:</Text>
          <select
            aria-label="Filter studio takes by project"
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

      {error ? <View><Text accessibilityRole="alert" style={styles.error}>{error}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry loading studio takes" onPress={() => {setLoading(true);void reload();}} style={{minHeight:44,justifyContent:'center'}}>
          <Text style={{color:Colors.gradientMid}}>Try again</Text>
        </Pressable>
      </View> : null}

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
                  : Platform.OS === 'web' ? "No takes yet. Upload your first one above." : "Recordings shared through your studio will appear here."}
              </Text>
            );
          return filtered.map((t) => (
            <TakeRow
              key={t.id}
              take={t}
              canProduce={!t.projectId || projects.find(project => project.id === t.projectId)?.role === 'producer'}
              projectName={projects.find(project => project.id === t.projectId)?.name}
              getToken={getToken}
              onTakeUpdated={(updated) =>
                setTakes((prev) => prev.map((tt) => (tt.id === updated.id ? { ...tt, ...updated } : tt)))
              }
            />
          ));
        })()}
      </View>
      </>}
    </View>
  );
}

function TakeRow({
  take,
  canProduce,
  projectName,
  getToken,
  onTakeUpdated,
}: {
  take: TakeRecord;
  canProduce: boolean;
  projectName?: string;
  getToken: () => Promise<string | null>;
  onTakeUpdated: (updated: TakeRecord) => void;
}) {
  const [analysis, setAnalysis] = useState<TakeAnalysis | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [openError, setOpenError] = useState<string | null>(null);

  function openTake() {
    if (!take.externalTrackId) return;
    setOpenError(null);
    try {
      router.push({ pathname: '/booth/[trackId]', params: {
        trackId: take.externalTrackId, takeId: take.id,
        ...(take.projectId ? { projectId: take.projectId } : {}),
      } });
    } catch {
      setOpenError('Could not open this recording. Tap the recording to try again.');
    }
  }
  const [noteDraft, setNoteDraft] = useState(take.producerNote ?? "");
  const [noteDirty, setNoteDirty] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [decisionUpdating, setDecisionUpdating] = useState(false);
  const waveformRef = useRef<TakeWaveformHandle | null>(null);
  const nativePlayerRef = useRef<UniversalAudioPlayerHandle | null>(null);
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
    const seconds = currentTimeRef.current || nativePlayerRef.current?.getCurrentTime() || 0;
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
    void (async () => {
      try {
        const token = await getToken();
        const detail = await fetchTakeDetail(token, take.id);
        if (!detail) throw new Error('Recording details are no longer available.');
        if (!cancelled) { setAnalysis(detail.analysis ?? null); setDetailError(null); }
      } catch (error) {
        if (!cancelled) setDetailError(`Could not load recording details. You can still open the song. ${error instanceof Error ? error.message : 'Try again.'}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [take.status, take.id, analysis, getToken, detailAttempt]);

  const [boothCopied, setBoothCopied] = useState(false);

  function copyBoothUrl() {
    if (!take.externalTrackId) return;
    if (Platform.OS !== "web" || typeof window === "undefined" || !navigator.clipboard) return;
    const url = new URL(`/booth/${encodeURIComponent(take.externalTrackId)}`, window.location.origin);
    if (take.projectId) url.searchParams.set('projectId', take.projectId);
    void navigator.clipboard.writeText(url.toString()).then(
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
        <Pressable style={{ flexBasis: '100%', flexGrow: 1, minWidth: 0, minHeight: 52, justifyContent: 'center' }}
          disabled={!take.externalTrackId} accessibilityRole={take.externalTrackId ? 'button' : undefined}
          accessibilityLabel={take.externalTrackId ? `Open studio recording ${take.filename}` : undefined}
          accessibilityHint="Opens this recording with the song lyrics and producer feedback"
          onPress={openTake}>
          <Text style={styles.takeName} numberOfLines={1}>
            {take.filename}
          </Text>
          <Text style={styles.takeMeta}>
            {projectName ? `${projectName} · ` : !take.projectId && take.externalTrackId ? `${take.externalTrackId} · ` : ""}
            {take.byteSize ? `${(take.byteSize / 1024 / 1024).toFixed(1)} MB · ` : ""}
            {take.durationSec ? `${take.durationSec.toFixed(1)}s · ` : ""}
            {new Date(take.uploadedAt).toLocaleString()}
          </Text>
        </Pressable>
        {take.externalTrackId ? <Pressable accessibilityRole="button" accessibilityLabel="Open studio song"
          onPress={openTake}
          style={[styles.boothBtn,{minHeight:48,minWidth:48}]}><Text style={styles.boothBtnText}>Open song</Text></Pressable> : null}
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
      {openError ? <Text accessibilityRole="alert" style={styles.error}>{openError}</Text> : null}
      {detailError ? <View>
        <Text accessibilityRole="alert" style={styles.error}>{detailError}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Retry details for ${take.filename}`} style={styles.retryButton} onPress={() => setDetailAttempt(attempt => attempt + 1)}>
          <Text style={styles.boothBtnText}>Try again</Text>
        </Pressable>
      </View> : null}
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
      {canProduce ? <View style={styles.producerBox}>
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
        {take.producerMemoUrl && !memoRecording ? (
          <UniversalAudioPlayer url={take.producerMemoUrl} label="Producer memo" />
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
        ) : take.storageUrl && take.status === "done" ? (
          <UniversalAudioPlayer ref={nativePlayerRef} url={take.storageUrl} label={take.filename} />
        ) : null}
        {pendingRegion ? (
          <View style={styles.regionPrompt}>
            <Text style={styles.regionPromptLabel}>
              New region · {formatTimestamp(pendingRegion.start)} → {formatTimestamp(pendingRegion.end)}
            </Text>
            <TextInput
              value={regionLabel}
              onChangeText={setRegionLabel}
              placeholder="Label (e.g. 'Chorus 2 — redo')"
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
                  onPress={() => {
                    if (Platform.OS === "web") waveformRef.current?.loopRegion(r.startSec, r.endSec);
                    else void nativePlayerRef.current?.seekTo(r.startSec);
                  }}
                  style={styles.regionBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Loop region"
                >
                  <Ionicons name={Platform.OS === "web" ? "repeat" : "play"} size={11} color={Colors.gradientStart} />
                  <Text style={styles.regionBtnText}>{Platform.OS === "web" ? "Loop" : "Play"}</Text>
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
            {Platform.OS === "web" ? <Pressable
              onPress={() => waveformRef.current?.clearLoop()}
              style={[styles.regionBtn, { alignSelf: "flex-start" }]}
              accessibilityRole="button"
              accessibilityLabel="Stop looping"
            >
              <Text style={[styles.regionBtnText, { color: Colors.textSecondary }]}>Stop loop</Text>
            </Pressable> : null}
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
      </View> : <View style={styles.producerBox}>
        {take.storageUrl ? <UniversalAudioPlayer url={take.storageUrl} label={take.filename} /> : null}
        {take.producerDecision ? <Text style={styles.consensusText}>Producer decision: {take.producerDecision === 'keeper' ? 'Keeper' : 'Re-do requested'}</Text> : null}
        {take.producerNote ? <Text style={styles.analysisNotes}>{take.producerNote}</Text> : null}
        {take.externalTrackId && take.projectId ? <Pressable accessibilityRole="button" accessibilityLabel="View lyrics and producer feedback" style={styles.boothBtn} onPress={openTake}>
          <Text style={styles.boothBtnText}>Lyrics & producer feedback</Text>
        </Pressable> : null}
      </View>}
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
  retryButton: { minHeight: 48, justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: 8 },
  takeRowHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
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
