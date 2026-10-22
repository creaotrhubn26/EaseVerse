import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AudioModule, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/creatorhub-auth";
import { authedFetch } from "@/lib/authed-fetch";
import { getApiUrl } from "@/lib/query-client";

function clock(value: number): string {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export type PlaybackJump = { id: number; seconds: number; loopEnd?: number };
export type UniversalAudioPlayerHandle = {
  getCurrentTime: () => number;
  seekTo: (seconds: number, autoplay?: boolean) => Promise<void>;
  pause: () => void;
};
type Props = { url: string; label?: string | null; jump?: PlaybackJump | null; markers?: number[] };

export const UniversalAudioPlayer = forwardRef<UniversalAudioPlayerHandle, Props>(function UniversalAudioPlayer(
  { url, label, jump, markers = [] }, ref,
) {
  const { getToken } = useAuth();
  const absolute = useMemo(() => new URL(url, getApiUrl()), [url]);
  const privateTake = absolute.origin === new URL(getApiUrl()).origin && (/^\/api\/takes\/[a-f0-9-]{36}\/audio$/.test(absolute.pathname) || absolute.pathname === "/api/takes/asset-audio");
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState(false);
  const [resolveAttempt, setResolveAttempt] = useState(0);
  useEffect(() => {
    if (!privateTake) return;
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => { if (!cancelled) setResolveError(true); controller.abort(); }, 20000);
    setResolvedUri(null); setResolveError(false);
    void (async () => {
      try {
        const token = await getToken();
        const response = await authedFetch(`${absolute.pathname}${absolute.search ? absolute.search + "&" : "?"}format=json`, token, { signal: controller.signal });
        if (!response.ok) throw new Error('Playback unavailable');
        const playback = await response.json() as { url: string };
        if (new URL(playback.url).protocol !== 'https:') throw new Error('Invalid playback');
        if (!cancelled) setResolvedUri(playback.url);
      } catch { if (!cancelled) setResolveError(true); }
      finally { clearTimeout(timeout); }
    })();
    return () => { cancelled = true; clearTimeout(timeout); controller.abort(); };
  }, [absolute, privateTake, getToken, resolveAttempt]);
  const source = useMemo(() => privateTake ? resolvedUri ? { uri: resolvedUri } : null : { uri: absolute.href }, [privateTake, resolvedUri, absolute.href]);
  const player = useAudioPlayer(source, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const duration = Math.max(0, Number(status.duration) || 0);
  const current = Math.min(duration || Number.MAX_SAFE_INTEGER, Math.max(0, Number(status.currentTime) || 0));
  const [trackWidth, setTrackWidth] = useState(0);
  const [loop, setLoop] = useState<{ start: number; end: number } | null>(null);
  const appliedJump = useRef<number | null>(null);
  const seekingLoop = useRef(false);
  const [playError, setPlayError] = useState(false);
  const ready = Boolean(status.isLoaded && duration > 0);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const failedToLoad = status.playbackState === 'failed' || status.playbackState === 'error' || loadTimedOut;
  useEffect(() => {
    setLoadTimedOut(false);
    if (!source || ready) return;
    const timeout = setTimeout(() => setLoadTimedOut(true), 20000);
    return () => clearTimeout(timeout);
  }, [source, ready, resolveAttempt]);
  const seekTo = useCallback(async (seconds: number, autoplay = true) => {
    if (!ready) return;
    try {
      setPlayError(false);
      await player.seekTo(Math.max(0, Math.min(duration, seconds)));
      if (autoplay) player.play();
    } catch { setPlayError(true); }
  }, [duration, player, ready]);

  useEffect(() => {
    void AudioModule.setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
    const subscription = AppState.addEventListener("change", state => {
      if (state !== "active") { try { player.pause(); } catch {} }
    });
    return () => { subscription.remove(); try { player.pause(); } catch {} };
  }, [player]);
  useEffect(() => { setLoop(null); setPlayError(false); }, [url]);
  useEffect(() => {
    if (!jump || !ready || appliedJump.current === jump.id) return;
    appliedJump.current = jump.id;
    const start = Math.max(0, Math.min(jump.seconds, duration));
    const end = Math.min(jump.loopEnd ?? 0, duration);
    setLoop(end > start ? { start, end } : null);
    void seekTo(jump.seconds);
  }, [duration, jump, ready, seekTo]);
  useEffect(() => {
    if (!loop || (!status.playing && !status.didJustFinish) || current < loop.end - 0.1 || seekingLoop.current) return;
    seekingLoop.current = true;
    void seekTo(loop.start).finally(() => { seekingLoop.current = false; });
  }, [current, loop, seekTo, status.playing, status.didJustFinish]);
  useImperativeHandle(ref, () => ({ getCurrentTime: () => current, seekTo, pause: () => player.pause() }), [current, player, seekTo]);

  return <View style={styles.player} accessibilityLabel={`${label || "Audio"} player`}>
    {label ? <Text style={styles.label} numberOfLines={1}>{label}</Text> : null}
    <Pressable onLayout={event => setTrackWidth(event.nativeEvent.layout.width)}
      disabled={!ready} accessibilityRole="adjustable" accessibilityLabel="Playback position"
      accessibilityValue={{ min: 0, max: duration || 1, now: current, text: `${clock(current)} of ${clock(duration)}` }}
      aria-valuemin={0} aria-valuemax={duration || 1} aria-valuenow={current} aria-valuetext={`${clock(current)} of ${clock(duration)}`}
      {...(Platform.OS === 'web' ? { onKeyDown: (event: { key: string; preventDefault: () => void }) => {
        if (!ready) return;
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? duration : event.key === 'ArrowRight' || event.key === 'ArrowUp' ? current + 5 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? current - 5 : null;
        if (target === null) return;
        event.preventDefault();
        void seekTo(target, false);
      } } : {})}
      accessibilityActions={[{ name: "increment", label: "Forward five seconds" }, { name: "decrement", label: "Back five seconds" }]}
      onAccessibilityAction={event => void seekTo(current + (event.nativeEvent.actionName === "increment" ? 5 : -5), false)}
      onPress={event => { if (trackWidth) void seekTo((event.nativeEvent.locationX / trackWidth) * duration, status.playing); }} style={styles.seekTarget}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${duration ? Math.min(100, current / duration * 100) : 0}%` }]} />
        {markers.filter(m => m >= 0 && m <= duration && duration > 0).map((m, i) => <View key={i} style={[styles.marker, { left: `${m / duration * 100}%` }]} />)}
      </View>
    </Pressable>
    <View style={styles.controls}>
      <Text style={styles.time}>{clock(current)}</Text>
      <Pressable disabled={!ready} onPress={() => void seekTo(current - 10, status.playing)} style={styles.secondary} accessibilityRole="button" accessibilityLabel="Back ten seconds"><Ionicons name="play-back" size={20} color={Colors.textSecondary} /></Pressable>
      <Pressable disabled={!ready} onPress={() => { if (status.playing) player.pause(); else if (current >= duration - 0.1) void seekTo(loop?.start ?? 0); else { try { setPlayError(false); player.play(); } catch { setPlayError(true); } } }} style={[styles.play, !ready && { opacity: 0.45 }]} accessibilityRole="button" accessibilityLabel={status.playing ? "Pause" : "Play"}>
        <Ionicons name={status.playing ? "pause" : "play"} size={24} color="#fff" />
      </Pressable>
      <Pressable disabled={!ready} onPress={() => void seekTo(current + 10, status.playing)} style={styles.secondary} accessibilityRole="button" accessibilityLabel="Forward ten seconds"><Ionicons name="play-forward" size={20} color={Colors.textSecondary} /></Pressable>
      <Text style={[styles.time, { textAlign: "right" }]}>{duration ? clock(duration) : "—"}</Text>
    </View>
    {loop ? <Pressable onPress={() => setLoop(null)} accessibilityRole="button" accessibilityLabel="Stop repeating section" style={styles.loop}><Ionicons name="repeat" size={16} color={Colors.gradientMid} /><Text style={styles.loopLabel}>{clock(loop.start)}–{clock(loop.end)} · Stop loop</Text></Pressable> : null}
    {!ready && !resolveError && !failedToLoad ? <Text accessibilityLiveRegion="polite" style={styles.label}>Loading audio…</Text> : null}
    {playError || resolveError || failedToLoad ? <View>
      <Text accessibilityRole="alert" style={styles.error}>Could not play this audio.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Retry loading audio" style={styles.loop} onPress={() => {
        setPlayError(false); setLoadTimedOut(false);
        if (privateTake) setResolveAttempt(attempt => attempt + 1);
        else { setResolveAttempt(attempt => attempt + 1); try { player.replace({ uri: absolute.href }); } catch { setPlayError(true); } }
      }}><Ionicons name="refresh" size={18} color={Colors.gradientMid} /><Text style={styles.loopLabel}>Try again</Text></Pressable>
    </View> : null}
  </View>;
});
const styles = StyleSheet.create({
  player: { gap: 2 },
  play: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: Colors.gradientStart },
  secondary: { width: 44, height: 48, alignItems: "center", justifyContent: "center" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  label: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 12, paddingTop: 4 },
  seekTarget: { height: 32, justifyContent: "center" },
  track: { height: 5, borderRadius: 4, backgroundColor: Colors.borderGlass, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, backgroundColor: Colors.gradientStart },
  marker: { position: "absolute", width: 2, height: "100%", backgroundColor: Colors.textPrimary },
  time: { flex: 1, color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 12, fontVariant: ["tabular-nums"] },
  loop: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  loopLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.gradientMid },
  error: { color: Colors.dangerUnderline, fontSize: 13, paddingVertical: 6 },
});
