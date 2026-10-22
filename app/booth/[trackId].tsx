import {usePreventRemove} from '@react-navigation/native';
import { StudioBookingsCard } from '@/components/StudioBookingsCard';
import { RecordingRequests, type RecordingRequest } from '@/components/RecordingRequests';
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { authedFetch } from "@/lib/authed-fetch";
import { mergeBoothSnapshot } from "@/lib/booth-snapshot";
import { createBoothRefresh } from "@/lib/booth-refresh";
import { DismissibleFeedbackPreview } from "@/components/DismissibleFeedbackPreview";
import { getApiUrl } from "@/lib/query-client";
import { parseProducerNote, formatTimestamp } from "@/lib/parse-timestamps";
import { useMetronome } from "@/lib/useMetronome";
import { studioBpm, type StudioTempo } from "@/lib/tempo";
import { currentPushEndpoint, subscribeToPush, unsubscribeFromPush } from "@/lib/push-client";
import { castVote, clearVote, fetchVoteTally, type ConsensusVote } from "@/lib/takes-client";
import { AUTH_CONFIGURED } from "@/lib/use-app-user";
import { TakeWaveform, type TakeWaveformHandle } from "@/components/TakeWaveform";
import {
  UniversalAudioPlayer,
  type UniversalAudioPlayerHandle,
  type PlaybackJump,
} from "@/components/UniversalAudioPlayer";

type BoothRegion = {
  id: string;
  startSec: number;
  endSec: number;
  label: string | null;
  color: string | null;
  autoLoop: boolean;
};

type BoothTake = {
  id: string;
  filename: string;
  uploadedAt: string;
  durationSec: number | null;
  status: string;
  audioUrl: string;
  audioExpiresAt?: number;
  producerNote: string | null;
  producerDecision: "keeper" | "redo" | null;
  producerMemoUrl: string | null;
  producerMemoDurationSec: number | null;
  decisionLockedAt: string | null;
  consensus: { agree: number; disagree: number };
  regions: BoothRegion[];
  lyricsSnapshot: string | null;
  lyricsSnapshotAt: string | null;
  recordingContext?:{requestId?:string;referenceVersionId?:string;referenceVersionNumber?:number;startSeconds:number;targetTrackName?:string}|null;
  transcript: string | null;
  aiNotes: string | null;
  pitchMeanHz: number | null;
  energyAvgDb: number | null;
};

type ReferenceComment = { id: string; body: string; seconds: number; endSeconds: number | null; author: string; status: string };

type BoothPayload = {
  trackId: string;
  projectId?: string;
  lyrics: { title: string | null; lyrics: string | null; bpm: number | null; updatedAt: string } | null;
  referenceTrack: { url: string; name: string | null; durationSec: number | null; versionId?: string; expiresAt?: number; producerComments?: ReferenceComment[] } | null;
  tempo?: StudioTempo;
  collaborationUnavailable?:boolean;
  recordingRequests?: RecordingRequest[];
  takes: BoothTake[];
};

const BOOTH_TIP_KEY = "@easeverse_booth_intro_dismissed_v1";

export default function BoothScreen() {
  const insets = useSafeAreaInsets();
  const { trackId, projectId, takeId } = useLocalSearchParams<{ trackId: string; projectId?: string; takeId?: string }>();
  const [requestPending,setRequestPending]=useState(false);
  usePreventRemove(requestPending,()=>Alert.alert('Unshared recording','Share the response or choose another recording before leaving.'));
  const [data, setData] = useState<BoothPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [introVisible, setIntroVisible] = useState(false);
  const [panel, setPanel] = useState<'lyrics' | 'feedback' | 'takes' | 'requests'>(takeId ? 'feedback' : 'lyrics');
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);
  const [audioChoice, setAudioChoice] = useState<'reference' | 'take' | 'memo'>('take');
  const [jump, setJump] = useState<PlaybackJump | null>(null);
  const jumpSerial = useRef(0);
  const [hiddenFeedback, setHiddenFeedback] = useState<Set<string>>(() => new Set());


  useEffect(() => {
    void AsyncStorage.getItem(BOOTH_TIP_KEY).then((v) => {
      if (v !== "1") setIntroVisible(true);
    });
  }, []);

  function dismissIntro() {
    setIntroVisible(false);
    void AsyncStorage.setItem(BOOTH_TIP_KEY, "1");
  }

  const { start: startClick, stop: stopClick, status: clickStatus, error: clickError } = useMetronome();
  const [clickOn, setClickOn] = useState(false);
  const effectiveBpm = studioBpm(data?.tempo, data?.lyrics?.bpm);

  useEffect(() => {
    if (!clickOn || effectiveBpm === null || error) { stopClick(); return; }
    void startClick(effectiveBpm).catch(() => setClickOn(false));
    return stopClick;
  }, [clickOn, effectiveBpm, error, startClick, stopClick]);
  useEffect(() => { setClickOn(false); stopClick(); }, [trackId, projectId, stopClick]);

  const auth = useBoothAuth();
  useEffect(() => { setClickOn(false); stopClick(); }, [auth.user?.id, stopClick]);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    void currentPushEndpoint().then((e) => setPushOn(!!e));
  }, []);

  async function togglePush() {
    setPushBusy(true);
    try {
      const token = await auth.getToken();
      if (pushOn) {
        await unsubscribeFromPush(token);
        setPushOn(false);
      } else {
        const sub = await subscribeToPush(token);
        setPushOn(!!sub);
      }
    } finally {
      setPushBusy(false);
    }
  }

  const refreshRef = useRef<ReturnType<typeof createBoothRefresh<BoothPayload>> | null>(null);
  const load = useCallback(async () => { await refreshRef.current?.refresh(); }, []);

  useEffect(() => {
    if (!trackId || !auth.isLoaded) return;
    // Never show a previous song/account while the next room is loading.
    setData(null);
    setLoading(true);
    setError(null);
    setSelectedTakeId(takeId || null);
    setPanel(takeId ? 'feedback' : 'lyrics');
    setAudioChoice('take');
    setHiddenFeedback(new Set());
    setJump(null);
    const updates = createBoothRefresh<BoothPayload>({
      initiallyActive: AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
      read: async signal => {
        const token = await auth.getToken();
        if (signal.aborted) throw new Error('Request cancelled');
        const response = await authedFetch(`/api/booth?trackId=${encodeURIComponent(String(trackId))}${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ''}`, token, { signal });
        if (response.status === 401) throw Object.assign(new Error('Sign in to CreatorHub to open this song.'), { status: 401 });
        if (response.status === 403 || response.status === 404) throw Object.assign(new Error('This song is not available. Open it from a Sound Room project you have access to.'), { status: response.status });
        if (!response.ok) throw new Error('Could not update this song. Check your connection and try again.');
        return await response.json() as BoothPayload;
      },
      onSnapshot: payload => {
        setData(previous => mergeBoothSnapshot(previous, payload));
        setError(null);
      },
      onError: error => {
        // A temporary connection failure keeps the current audio/lyrics intact.
        // Lost access must not leave a private room/player visible.
        if ([401, 403, 404].includes((error as { status?: number }).status ?? 0)) setData(null);
        setError((error as Error).message || 'Could not update this song. Try again.');
      },
      onSettled: () => setLoading(false),
    });
    refreshRef.current = updates;
    // Authenticated polling uses the same five-second cadence as the server's
    // stream, and also supports native bearer tokens and cross-origin sessions.
    void updates.refresh();
    const lifecycle = AppState.addEventListener('change', state => updates.setActive(state === 'active'));
    return () => {
      lifecycle.remove();
      updates.dispose();
      if (refreshRef.current === updates) refreshRef.current = null;
    };
  }, [trackId, projectId, takeId, auth.user?.id, auth.isLoaded, auth.getToken]);

  const selectedTake = selectedTakeId ? data?.takes.find(take => take.id === selectedTakeId) : data?.takes[0];
  const missingRequestedTake = Boolean(data && selectedTakeId && !selectedTake);
  const activeAudio = audioChoice === 'reference' && data?.referenceTrack
    ? { id: 'reference', url: data.referenceTrack.url, name: data.referenceTrack.name || 'Reference mix' }
    : audioChoice === 'memo' && selectedTake?.producerMemoUrl
      ? { id: `memo-${selectedTake.id}`, url: selectedTake.producerMemoUrl, name: 'Producer voice note' }
      : selectedTake?.audioUrl
        ? { id: selectedTake.id, url: selectedTake.audioUrl, name: selectedTake.filename }
        : data?.referenceTrack && !missingRequestedTake ? { id: 'reference', url: data.referenceTrack.url, name: data.referenceTrack.name || 'Reference mix' } : null;
  const isReference = activeAudio?.id === 'reference';
  const referenceComments = data?.referenceTrack?.producerComments || [];
  const hasFeedback = isReference ? referenceComments.length > 0 : Boolean(selectedTake?.producerNote || selectedTake?.producerMemoUrl || selectedTake?.regions.length);
  const feedbackKey = isReference ? JSON.stringify([data?.projectId, data?.referenceTrack?.versionId, referenceComments]) : JSON.stringify([data?.projectId, data?.trackId, selectedTake?.id, selectedTake?.producerNote, selectedTake?.producerMemoUrl, selectedTake?.regions]);
  const noteTimes = parseProducerNote(selectedTake?.producerNote).filter(segment => segment.kind === 'timestamp').map(segment => segment.seconds);
  const referenceMoment = (comment: ReferenceComment) => { setAudioChoice('reference'); setJump({ id: ++jumpSerial.current, seconds: comment.seconds, ...(comment.endSeconds != null && comment.endSeconds > comment.seconds ? { loopEnd: comment.endSeconds } : {}) }); };
  const chooseAudio = (choice: 'reference' | 'take' | 'memo') => { setJump(null); setAudioChoice(choice); };
  const playMoment = (seconds: number, loopEnd?: number) => {
    setAudioChoice('take'); setJump({ id: ++jumpSerial.current, seconds, loopEnd });
  };

  return <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
    <View style={styles.headerRow}>
      <Pressable disabled={requestPending} onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Leave booth view">
        <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.headerEyebrow}>EaseVerse · Vocal booth</Text>
        <Text style={styles.headerTitle} numberOfLines={1}>{data?.lyrics?.title || trackId}</Text>
      </View>
      {auth.user?.picture ? <Image source={{ uri: new URL(auth.user.picture, getApiUrl()).href }} accessibilityLabel={auth.user.name || 'Artist'} style={{ width: 36, height: 36, borderRadius: 18 }} /> : null}
      <Pressable onPress={() => {
        if (clickStatus === 'playing' || clickStatus === 'loading') { setClickOn(false); stopClick(); }
        else if (effectiveBpm !== null) { setClickOn(true); void startClick(effectiveBpm).catch(() => setClickOn(false)); }
      }} disabled={effectiveBpm === null}
        style={[styles.headerButton, {minWidth: 48, minHeight: 48}, clickStatus === 'playing' && styles.clickBtnActive]}
        accessibilityRole="button" accessibilityLabel={effectiveBpm === null ? 'Producer has not set a BPM' : `${clickOn ? 'Stop' : 'Start'} metronome, producer tempo ${effectiveBpm} BPM`}
        accessibilityState={{disabled: effectiveBpm === null, selected: clickStatus === 'playing', busy: clickStatus === 'loading'}}>
        <Ionicons name="musical-notes" size={18} color={clickStatus === 'playing' ? Colors.background : Colors.gradientMid} />
        <Text style={[styles.bpm, clickStatus === 'playing' && {color:Colors.background}]}>{effectiveBpm === null ? 'BPM —' : `${effectiveBpm} BPM`}</Text>
      </Pressable>
      {Platform.OS === 'web' && typeof Notification !== 'undefined' ? <Pressable onPress={togglePush} disabled={pushBusy} style={styles.headerButton} accessibilityRole="button" accessibilityLabel={pushOn ? 'Disable push notifications' : 'Enable push notifications'}><Ionicons name={pushOn ? 'notifications' : 'notifications-outline'} size={20} color={Colors.textSecondary} /></Pressable> : null}
    </View>
    <View style={styles.panelTabs} accessibilityRole="tablist">
      {(['lyrics', 'feedback', 'takes', 'requests'] as const).map(item => <Pressable key={item} disabled={requestPending && item!=='requests'} onPress={() => setPanel(item)} accessibilityRole="tab" accessibilityState={{ selected: panel === item }} aria-selected={panel === item} accessibilityLabel={item === 'lyrics' ? 'Lyrics' : item === 'feedback' ? 'Producer feedback' : item === 'requests' ? 'Recording requests' : 'Takes'} style={[styles.panelTab, panel === item && styles.panelTabActive]}>
        <Text style={[styles.panelTabLabel, panel === item && styles.panelTabLabelActive]}>{item === 'lyrics' ? 'Lyrics' : item === 'feedback' ? 'Feedback' : item === 'requests' ? 'Requests' : 'Takes'}</Text>
        {item === 'feedback' && hasFeedback ? <View style={styles.feedbackDot} /> : item === 'takes' ? <Text style={styles.tabCount}>{data?.takes.length ?? 0}</Text> : item==='requests' ? <Text style={styles.tabCount}>{data?.recordingRequests?.filter(r=>r.status==='open').length||0}</Text> : null}
      </Pressable>)}
    </View>
    {loading && !data ? <ActivityIndicator accessibilityLabel="Loading vocal booth" color={Colors.gradientMid} style={{ marginTop: 32 }} /> : error && !data ? <View style={styles.stateCard}><Text style={styles.error}>{error}</Text><Pressable onPress={() => void (!auth.user && auth.signIn ? auth.signIn().then(load) : load())} style={styles.headerButton} accessibilityRole="button" accessibilityLabel={!auth.user ? "Sign in to open song" : "Retry loading song"}><Text style={styles.panelTabLabelActive}>{!auth.user ? "Continue with CreatorHub" : "Try again"}</Text></Pressable></View> : <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll}>
        {missingRequestedTake ? <View style={styles.stateCard}>
          <Text accessibilityRole="alert" style={styles.error}>This recording is no longer available in this song. Choose another take or go back to Sessions.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose another studio take" style={styles.headerButton} onPress={() => { setSelectedTakeId(null); setPanel('takes'); }}><Text style={styles.panelTabLabelActive}>Choose another take</Text></Pressable>
        </View> : null}
        {error && data ? <Pressable accessibilityRole="button" accessibilityLabel="Retry song updates" onPress={() => void load()} style={styles.hintRow}><Text accessibilityLiveRegion="polite" aria-live="polite" style={styles.hintText}>Could not refresh. Retrying automatically. Tap to retry now.</Text></Pressable> : null}
        {data?.projectId ? <StudioBookingsCard key={data.projectId} projectId={data.projectId} compact disabled={requestPending} /> : null}
        {introVisible ? <View style={styles.hintRow}><Text style={styles.hintText}>Tap a timecode to hear feedback in context.</Text><Pressable onPress={dismissIntro} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Dismiss booth tip"><Ionicons name="close" size={18} color={Colors.textSecondary} /></Pressable></View> : null}
        {data?.projectId&&<Pressable accessibilityRole="button" accessibilityLabel="Åpne oppvarming fra produsenten" onPress={()=>router.push({pathname:'/warmup-session',params:{projectId:data.projectId}})} style={styles.hintRow}><Ionicons name="headset-outline" size={20} color={Colors.gradientMid}/><Text style={styles.hintText}>Oppvarming fra produsenten</Text><Ionicons name="chevron-forward" size={18} color={Colors.textSecondary}/></Pressable>}
        {panel!=='requests' && data?.recordingRequests?.some(r=>r.status==='open') ? <Pressable accessibilityRole="button" accessibilityLabel="Open recording requests" onPress={()=>{chooseAudio('reference');setPanel('requests');}} style={styles.hintRow}><Text style={styles.hintText}>Your producer has requested a new recording. Open requests →</Text></Pressable>:null}
        {clickError ? <Text accessibilityRole="alert" style={styles.error}>{clickError}</Text> : null}
        {panel === 'requests' ? data?.collaborationUnavailable ? <Text accessibilityRole="alert" style={styles.error}>Recording requests are temporarily unavailable. Your song and recordings are still available.</Text> : <RecordingRequests requests={data?.recordingRequests||[]} projectId={data?.projectId||''} refresh={()=>void load()} onPendingChange={setRequestPending}/> : panel === 'lyrics' ? <>
          <View style={styles.lyricsCard}>
            {data?.lyrics?.lyrics ? data.lyrics.lyrics.split('\n').map((line, index) => <Text key={index} style={/^\[.+\]$/.test(line.trim()) ? styles.lyricSection : styles.lyricsText}>{line || ' '}</Text>) : <Text style={styles.empty}>Lyrics will appear here when they are shared with you.</Text>}
          </View>
          {hasFeedback ? <DismissibleFeedbackPreview key={feedbackKey} hidden={hiddenFeedback.has(feedbackKey)} onDismiss={() => setHiddenFeedback(previous => new Set(previous).add(feedbackKey))} onUndo={() => setHiddenFeedback(previous => { const next = new Set(previous); next.delete(feedbackKey); return next; })}><Pressable onPress={() => setPanel('feedback')} style={styles.feedbackPreview} accessibilityRole="button" accessibilityLabel="Read producer feedback">
            <View style={styles.feedbackPreviewTitle}><Ionicons name="chatbubble-ellipses-outline" size={20} color={Colors.gradientMid} /><Text style={styles.feedbackTitle}>Producer feedback</Text><Ionicons name="chevron-forward" size={17} color={Colors.textSecondary} /></View>
            <Text numberOfLines={2} style={styles.previewText}>{isReference ? referenceComments[0]?.body : selectedTake?.producerNote || 'Listen to the producer’s voice note and marked sections.'}</Text>
          </Pressable></DismissibleFeedbackPreview> : null}
        </> : panel === 'feedback' ? isReference ? <>
          <Text style={styles.sectionLabel}>Feedback on reference mix</Text>
          <Text style={styles.takeMeta}>{data?.referenceTrack?.name}</Text>
          {!referenceComments.length ? <Text style={styles.empty}>No producer feedback on this reference mix yet.</Text> : referenceComments.map(comment => <View key={comment.id} style={styles.lyricsCard}>
            <View style={styles.feedbackPreviewTitle}><Text style={styles.takeMeta}>{comment.author}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Play reference feedback at ${formatTimestamp(comment.seconds)}`} onPress={() => referenceMoment(comment)} style={styles.headerButton}><Ionicons name="play-circle-outline" size={20} color={Colors.gradientMid} /><Text style={styles.timestampLink}>{formatTimestamp(comment.seconds)}{comment.endSeconds != null && comment.endSeconds > comment.seconds ? `–${formatTimestamp(comment.endSeconds)}` : ''}</Text></Pressable></View>
            <Text style={styles.producerNoteText}>{comment.body}</Text>
          </View>)}
        </> : selectedTake ? <TakeCard take={selectedTake} onSeek={seconds => playMoment(seconds)} onLoop={(start, end) => playMoment(start, end)} onPlayMemo={() => chooseAudio('memo')} /> : <Text style={styles.empty}>Feedback appears here when a take is shared.</Text> : <>
          <Text style={styles.sectionLabel}>Choose a take to listen and review</Text>
          {!data?.takes.length ? <Text style={styles.empty}>No takes have been shared yet.</Text> : data.takes.map((take, index) => <Pressable key={take.id} onPress={() => { setSelectedTakeId(take.id); chooseAudio('take'); setPanel('feedback'); }} style={[styles.takeChoice, selectedTake?.id === take.id && styles.takeChoiceSelected]} accessibilityRole="button" accessibilityState={{ selected: selectedTake?.id === take.id }} aria-pressed={selectedTake?.id === take.id} accessibilityLabel={`Open ${take.filename}`}>
            <View style={styles.takeNumber}><Text style={styles.panelTabLabel}>{index + 1}</Text></View><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={styles.takeName}>{take.filename}</Text><Text style={styles.takeMeta}>{take.recordingContext ? `Mix V${take.recordingContext.referenceVersionNumber||'?'} · starts ${formatTimestamp(take.recordingContext.startSeconds)} · ` : ''}{take.durationSec ? formatTimestamp(take.durationSec) + ' · ' : ''}{new Date(take.uploadedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Text></View><Ionicons name={selectedTake?.id === take.id ? 'checkmark-circle' : 'chevron-forward'} size={22} color={selectedTake?.id === take.id ? Colors.gradientMid : Colors.textSecondary} />
          </Pressable>)}
        </>}
      </ScrollView>
      {activeAudio && panel!=='requests' ? <View style={[styles.playerDock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.sourceTabs}>
          {data?.referenceTrack ? <Pressable onPress={() => chooseAudio('reference')} accessibilityRole="button" accessibilityState={{ selected: activeAudio.id === 'reference' }} aria-pressed={activeAudio.id === 'reference'} style={[styles.sourceTab, activeAudio.id === 'reference' && styles.sourceTabActive]}><Text style={[styles.sourceLabel, activeAudio.id === 'reference' && styles.panelTabLabelActive]}>Reference mix</Text></Pressable> : null}
          {selectedTake?.audioUrl ? <Pressable onPress={() => chooseAudio('take')} accessibilityRole="button" accessibilityState={{ selected: activeAudio.id === selectedTake.id }} aria-pressed={activeAudio.id === selectedTake.id} style={[styles.sourceTab, activeAudio.id === selectedTake.id && styles.sourceTabActive]}><Text style={[styles.sourceLabel, activeAudio.id === selectedTake.id && styles.panelTabLabelActive]}>Vocal take</Text></Pressable> : null}
        </View>
        <UniversalAudioPlayer key={activeAudio.id} url={activeAudio.url} label={activeAudio.name} jump={jump} markers={isReference ? referenceComments.map(comment => comment.seconds) : activeAudio.id === selectedTake?.id ? noteTimes : []} />
      </View> : null}
    </>}
  </View>;

}

function useBoothAuth(): { getToken: () => Promise<string | null>; isLoaded: boolean; signIn?: () => Promise<boolean>; user?: { id?: string; name?: string; picture?: string } | null } {
  if (AUTH_CONFIGURED) {
    const mod = require("@/lib/creatorhub-auth") as typeof import("@/lib/creatorhub-auth");
    const ctx = mod.useAuth();
    return { getToken: ctx.getToken, isLoaded: ctx.isLoaded, signIn: ctx.signIn, user: ctx.user };
  }
  return { getToken: async () => null, isLoaded: true };
}

function TakeCard({ take, onSeek, onLoop, onPlayMemo }: { take: BoothTake; onSeek: (seconds: number) => void; onLoop: (start: number, end: number) => void; onPlayMemo: () => void }) {
  const waveformRef = useRef<TakeWaveformHandle | null>(null);
  const nativePlayerRef = useRef<UniversalAudioPlayerHandle | null>(null);
  const noteSegments = parseProducerNote(take.producerNote);
  const noteMarkers = noteSegments
    .filter((s): s is { kind: "timestamp"; raw: string; seconds: number } => s.kind === "timestamp")
    .map((s) => ({ seconds: s.seconds, label: s.raw, color: Colors.gradientMid }));
  const [myVote, setMyVote] = useState<ConsensusVote | null>(null);
  const [tally, setTally] = useState(take.consensus);
  const [voting, setVoting] = useState(false);
  const [disagreeDraft, setDisagreeDraft] = useState("");
  const [disagreePromptOpen, setDisagreePromptOpen] = useState(false);
  const auth = useBoothAuth();
  const [authedToken, setAuthedToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void auth.getToken().then((t) => {
      if (cancelled) return;
      setAuthedToken(t);
      if (t) {
        void fetchVoteTally(t, take.id)
          .then((res) => {
            if (cancelled) return;
            setTally({ agree: res.agree, disagree: res.disagree });
            setMyVote(res.myVote);
          })
          .catch(() => undefined);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [take.id]);

  useEffect(() => {
    setTally(take.consensus);
  }, [take.consensus.agree, take.consensus.disagree, take.consensus]);

  async function vote(next: ConsensusVote, comment?: string) {
    if (!authedToken) return;
    setVoting(true);
    try {
      if (myVote === next) {
        const t = await clearVote(authedToken, take.id);
        setMyVote(t.myVote);
        setTally({ agree: t.agree, disagree: t.disagree });
      } else {
        const t = await castVote(authedToken, take.id, next, comment);
        setMyVote(t.myVote);
        setTally({ agree: t.agree, disagree: t.disagree });
      }
      setDisagreePromptOpen(false);
      setDisagreeDraft("");
    } catch (err) {
      console.warn("vote failed:", err);
    } finally {
      setVoting(false);
    }
  }

  function scrubTo(seconds: number) { onSeek(seconds); }

  return (
    <View style={[styles.takeRow, { flexDirection: "column", alignItems: "stretch" }]}>
    <View style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.takeName} numberOfLines={1}>
          {take.filename}
        </Text>
        <Text style={styles.takeMeta}>
          {take.durationSec ? `${take.durationSec.toFixed(1)}s · ` : ""}
          {take.pitchMeanHz ? `${take.pitchMeanHz.toFixed(0)} Hz · ` : ""}
          {take.energyAvgDb !== null ? `${take.energyAvgDb} dB · ` : ""}
          {new Date(take.uploadedAt).toLocaleTimeString()}
        </Text>
        {take.regions.length > 0 ? (
          <View style={styles.regionList}>
            <Text style={styles.regionsHeader}>Producer asks for:</Text>
            {take.regions.map((r) => (
              <View key={r.id} style={styles.regionRow}>
                <Text style={styles.regionLabel} numberOfLines={1}>
                  {r.label || "Section"} · {formatTimestamp(r.startSec)}–{formatTimestamp(r.endSec)}
                </Text>
                <Pressable
                  onPress={() => {
                    onLoop(r.startSec, r.endSec);
                  }}
                  style={styles.loopBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Loop ${r.label || "section"}`}
                >
                  <Ionicons name="repeat" size={11} color={Colors.gradientStart} />
                  <Text style={styles.loopBtnText}>Loop</Text>
                </Pressable>
              </View>
            ))}

          </View>
        ) : null}
        {take.producerMemoUrl ? (
          <View style={styles.memoBlock}>
            <Ionicons name="mic" size={14} color={Colors.gradientMid} />
            <View style={{ flex: 1 }}>
              <Pressable onPress={onPlayMemo} accessibilityRole="button" accessibilityLabel="Play producer voice note" style={styles.voiceNoteButton}><Text style={styles.panelTabLabelActive}>Listen to voice note</Text></Pressable>
            </View>
            {take.producerMemoDurationSec ? (
              <Text style={styles.memoDuration}>
                {Math.round(take.producerMemoDurationSec)}s
              </Text>
            ) : null}
          </View>
        ) : null}
        {noteSegments.length > 0 ? (
          <View style={styles.producerNoteBlock}>
            <Text style={styles.producerNoteLabel}>Producer note</Text>
            <Text style={styles.producerNoteText}>
              {noteSegments.map((seg, i) =>
                seg.kind === "text" ? (
                  <Text key={i}>{seg.text}</Text>
                ) : (
                  <Text
                    key={i}
                    onPress={() => scrubTo(seg.seconds)}
                    accessibilityRole="link"
                    accessibilityLabel={`Jump to ${seg.raw}`}
                    style={styles.timestampLink}
                  >
                    {seg.raw}
                  </Text>
                ),
              )}
            </Text>
          </View>
        ) : null}
        {take.lyricsSnapshotAt ? (
          <Text style={styles.lyricsVersionHint} numberOfLines={1}>
            Sung against lyrics from {new Date(take.lyricsSnapshotAt).toLocaleString()}
          </Text>
        ) : null}
        {take.aiNotes ? (
          <View style={styles.aiNotesBlock}>
            <Text style={styles.aiNotesLabel}>AI feedback</Text>
            <Text style={styles.takeNotes}>{take.aiNotes}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        {take.producerDecision ? (
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Text
              style={[
                styles.decisionBadge,
                take.producerDecision === "keeper" ? styles.decisionKeeper : styles.decisionRedo,
              ]}
            >
              {take.producerDecision === "keeper" ? "Keeper" : "Re-do"}
              {take.decisionLockedAt ? " · 🔒" : ""}
            </Text>
            <Text style={styles.tallyText}>
              👍 {tally.agree} · 👎 {tally.disagree}
            </Text>
          </View>
        ) : null}
        <Text style={[styles.statusBadge, { color: statusColor(take.status) }]}>{take.status}</Text>
      </View>
    </View>
    {take.producerDecision && authedToken ? (
      <View style={styles.voteRow}>
        <Text style={styles.voteRowLabel}>Your vote:</Text>
        <Pressable
          onPress={() => vote("agree")}
          disabled={voting}
          style={[styles.voteBtn, myVote === "agree" && styles.voteBtnActive]}
          accessibilityRole="button"
          accessibilityLabel="Agree with producer"
        >
          <Text style={[styles.voteBtnText, myVote === "agree" && { color: Colors.successUnderline }]}>
            👍 Agree
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (myVote === "disagree") void vote("disagree");
            else setDisagreePromptOpen(true);
          }}
          disabled={voting}
          style={[styles.voteBtn, myVote === "disagree" && styles.voteBtnActive]}
          accessibilityRole="button"
          accessibilityLabel="Disagree with producer"
        >
          <Text style={[styles.voteBtnText, myVote === "disagree" && { color: Colors.dangerUnderline }]}>
            👎 Disagree
          </Text>
        </Pressable>
      </View>
    ) : null}
    {disagreePromptOpen ? (
      <View style={styles.disagreePrompt}>
        <Text style={styles.disagreePromptLabel}>Why? (required)</Text>
        <TextInput value={disagreeDraft} onChangeText={setDisagreeDraft} placeholder="What would you change?" placeholderTextColor={Colors.textTertiary} multiline accessibilityLabel="Reason for disagreeing" style={styles.disagreeInput} />
        <View style={{ flexDirection: "row", gap: 6, justifyContent: "flex-end" }}>
          <Pressable
            onPress={() => {
              setDisagreePromptOpen(false);
              setDisagreeDraft("");
            }}
            style={styles.voteBtn}
          >
            <Text style={styles.voteBtnText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => void vote("disagree", disagreeDraft)}
            disabled={!disagreeDraft.trim()}
            style={[styles.voteBtn, disagreeDraft.trim() && styles.voteBtnActive]}
          >
            <Text style={[styles.voteBtnText, disagreeDraft.trim() && { color: Colors.dangerUnderline }]}>
              Send
            </Text>
          </Pressable>
        </View>
      </View>
    ) : null}
    </View>
  );
}

function statusColor(status: string): string {
  if (status === "done") return Colors.successUnderline;
  if (status === "error") return Colors.dangerUnderline;
  return Colors.gradientMid;
}

const styles = StyleSheet.create({
  headerButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, gap: 2 },
  panelTabs: { flexDirection: 'row', gap: 4, borderBottomWidth: 1, borderBottomColor: Colors.borderGlass },
  panelTab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  panelTabActive: { borderBottomColor: Colors.gradientMid },
  panelTabLabel: { color: Colors.textSecondary, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  panelTabLabelActive: { color: Colors.gradientMid, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  feedbackDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.gradientMid },
  tabCount: { color: Colors.textTertiary, fontFamily: 'Inter_500Medium', fontSize: 12 },
  hintRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 10, borderRadius: 12, backgroundColor: Colors.surface },
  hintText: { flex: 1, color: Colors.textSecondary, fontSize: 12, lineHeight: 18 },
  lyricSection: { color: Colors.gradientMid, fontFamily: 'Inter_600SemiBold', fontSize: 12, letterSpacing: 0.7, marginBottom: 7, marginTop: 6 },
  feedbackPreview: { padding: 16, borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderGlass, gap: 10 },
  feedbackPreviewTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  feedbackTitle: { flex: 1, color: Colors.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  previewText: { color: Colors.textSecondary, fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 22 },
  playerDock: { borderTopWidth: 1, borderTopColor: Colors.borderGlass, paddingTop: 8, backgroundColor: Colors.background },
  sourceTabs: { flexDirection: 'row', gap: 8 },
  sourceTab: { minHeight: 44, justifyContent: 'center', alignItems: 'center', flex: 1, borderRadius: 9 },
  sourceTabActive: { backgroundColor: Colors.surface },
  sourceLabel: { color: Colors.textSecondary, fontFamily: 'Inter_500Medium', fontSize: 13 },
  takeChoice: { minHeight: 76, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderGlass, backgroundColor: Colors.surface, flexDirection: 'row', alignItems: 'center', gap: 12 },
  takeChoiceSelected: { borderColor: Colors.gradientMid },
  takeNumber: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceGlass },
  stateCard: { padding: 20, gap: 12 },
  voiceNoteButton: { minHeight: 44, justifyContent: 'center' },
  disagreeInput: { minHeight: 80, padding: 12, backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1, borderColor: Colors.borderGlass, color: Colors.textPrimary, fontSize: 15 },

  screen: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  headerEyebrow: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  headerTitle: { color: Colors.textPrimary, fontFamily: "Inter_700Bold", fontSize: 18, marginTop: 1 },
  bpm: { color: Colors.gradientMid, fontFamily: "Inter_700Bold", fontSize: 13 },
  scroll: { gap: 16, paddingVertical: 16, paddingBottom: 24 },
  lyricsCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 0,
  },
  sectionLabel: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  lyricsText: {
    color: Colors.textPrimary,
    fontFamily: "Inter_500Medium",
    fontSize: 21,
    lineHeight: 33,
  },
  takeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  takeName: { color: Colors.textPrimary, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  takeMeta: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 2 },
  takeNotes: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 4, lineHeight: 17 },
  statusBadge: { fontFamily: "Inter_700Bold", fontSize: 11, textTransform: "uppercase" },
  decisionBadge: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  decisionKeeper: {
    color: Colors.successUnderline,
    borderColor: Colors.successUnderline + "66",
    backgroundColor: Colors.successUnderline + "1c",
  },
  decisionRedo: {
    color: Colors.dangerUnderline,
    borderColor: Colors.dangerUnderline + "66",
    backgroundColor: Colors.dangerUnderline + "1c",
  },
  producerNoteBlock: {
    marginTop: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.gradientMid + "15",
    borderLeftWidth: 3,
    borderLeftColor: Colors.gradientMid,
    gap: 2,
  },
  producerNoteLabel: {
    color: Colors.gradientMid,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  producerNoteText: {
    color: Colors.textPrimary,
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    lineHeight: 25,
  },
  timestampLink: {
    color: Colors.gradientMid,
    fontFamily: "Inter_700Bold",
    textDecorationLine: "underline",
  },
  memoBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    marginTop: 6,
    borderRadius: 8,
    backgroundColor: Colors.gradientMid + "10",
    borderWidth: 1,
    borderColor: Colors.gradientMid + "33",
  },
  memoDuration: {
    color: Colors.gradientMid,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  tallyText: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  voteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderGlass,
  },
  voteRowLabel: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  voteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 44,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surface,
  },
  voteBtnActive: {
    borderColor: Colors.gradientMid,
    backgroundColor: Colors.gradientMid + "1c",
  },
  voteBtnText: {
    color: Colors.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  disagreePrompt: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 6,
  },
  disagreePromptLabel: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  regionList: {
    marginTop: 6,
    gap: 4,
  },
  regionsHeader: {
    color: Colors.gradientStart,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  regionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 10,
    minHeight: 44,
    borderRadius: 7,
    backgroundColor: Colors.gradientStart + "12",
    borderWidth: 1,
    borderColor: Colors.gradientStart + "44",
  },
  regionLabel: {
    flex: 1,
    color: Colors.textPrimary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  loopBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 10,
    minHeight: 44,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.gradientStart + "66",
    backgroundColor: Colors.surface,
  },
  loopBtnText: {
    color: Colors.gradientStart,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
  },
  refCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 4,
  },
  refName: {
    color: Colors.textPrimary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  lyricsVersionHint: {
    color: Colors.textTertiary,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    fontStyle: "italic",
    marginTop: 4,
  },
  introCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: Colors.gradientStart + "12",
    borderWidth: 1,
    borderColor: Colors.gradientStart + "44",
  },
  introTitle: {
    color: Colors.textPrimary,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  introBody: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 17,
  },
  introCode: {
    fontFamily: "Inter_700Bold",
    color: Colors.gradientMid,
    backgroundColor: Colors.surface,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  clickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 44,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Colors.gradientStart + "55",
    backgroundColor: Colors.surface,
  },
  clickBtnActive: {
    backgroundColor: Colors.gradientStart,
    borderColor: Colors.gradientStart,
  },
  clickBtnText: {
    color: Colors.gradientStart,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  aiNotesBlock: { marginTop: 4 },
  aiNotesLabel: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  empty: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 12, fontStyle: "italic" },
  error: { color: Colors.dangerUnderline, fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 24 },
});
