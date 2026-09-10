import React, { forwardRef, useEffect, useImperativeHandle, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AudioModule, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import Colors from "@/constants/colors";

function clock(value: number): string {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export type UniversalAudioPlayerHandle = {
  getCurrentTime: () => number;
  seekTo: (seconds: number, autoplay?: boolean) => Promise<void>;
};

type Props = {
  url: string;
  label?: string | null;
};

export const UniversalAudioPlayer = forwardRef<UniversalAudioPlayerHandle, Props>(function UniversalAudioPlayer(
  { url, label },
  ref,
) {
  const source = useMemo(() => ({ uri: url }), [url]);
  const player = useAudioPlayer(source, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const duration = Math.max(0, Number(status.duration) || 0);
  const current = Math.min(duration || Number.MAX_SAFE_INTEGER, Math.max(0, Number(status.currentTime) || 0));
  const progress = duration > 0 ? Math.min(1, current / duration) : 0;

  useEffect(() => {
    void AudioModule.setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
    return () => { try { player.pause(); } catch { /* already released */ } };
  }, [player]);

  const toggle = () => {
    if (status.playing) player.pause();
    else player.play();
  };

  const seek = (offset: number) => {
    const upper = duration > 0 ? duration : current + Math.max(0, offset);
    void player.seekTo(Math.max(0, Math.min(upper, current + offset)));
  };

  useImperativeHandle(ref, () => ({
    getCurrentTime: () => Math.max(0, Number(status.currentTime) || 0),
    seekTo: async (seconds: number, autoplay = true) => {
      const target = Math.max(0, duration > 0 ? Math.min(duration, seconds) : seconds);
      await player.seekTo(target);
      if (autoplay) player.play();
    },
  }), [duration, player, status.currentTime]);

  return (
    <View style={styles.player} accessibilityLabel={`${label || "Audio"} player`}>
      <Pressable onPress={() => seek(-10)} style={styles.secondary} accessibilityRole="button" accessibilityLabel="Back ten seconds">
        <Ionicons name="play-back" size={16} color={Colors.textSecondary} />
      </Pressable>
      <Pressable onPress={toggle} style={styles.play} accessibilityRole="button" accessibilityLabel={status.playing ? "Pause" : "Play"}>
        <Ionicons name={status.playing ? "pause" : "play"} size={18} color="#fff" />
      </Pressable>
      <View style={styles.timeline}>
        {label ? <Text style={styles.label} numberOfLines={1}>{label}</Text> : null}
        <View style={styles.track}><View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} /></View>
        <Text style={styles.time}>{clock(current)} / {duration > 0 ? clock(duration) : "—"}</Text>
      </View>
      <Pressable onPress={() => seek(10)} style={styles.secondary} accessibilityRole="button" accessibilityLabel="Forward ten seconds">
        <Ionicons name="play-forward" size={16} color={Colors.textSecondary} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  player: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 9, padding: 8, borderRadius: 11, backgroundColor: Colors.surfaceGlass, borderWidth: 1, borderColor: Colors.borderGlass },
  play: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: Colors.gradientStart },
  secondary: { width: 28, height: 36, alignItems: "center", justifyContent: "center" },
  timeline: { flex: 1, minWidth: 0, gap: 4 },
  label: { color: Colors.textPrimary, fontFamily: "Inter_600SemiBold", fontSize: 11 },
  track: { height: 4, borderRadius: 4, backgroundColor: Colors.borderGlass, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, backgroundColor: Colors.gradientStart },
  time: { color: Colors.textTertiary, fontFamily: "Inter_500Medium", fontSize: 9 },
});
