import React, { useCallback, useEffect, useState, useRef } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus, AudioModule } from "expo-audio";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useWarmupSoundscape } from "@/components/WarmupSoundscape";
import { warmupNarration } from "@/constants/warmup-narration";
import { warmupNarrationAssets } from "@/constants/warmup-narration-assets";

export function WarmupVoicePlayer({
  exerciseId,
  customClip,
}: {
  exerciseId: string;
  customClip?: {
    url: string;
    title: string;
    transcript: string;
    kind?: "voice" | "music";
  };
}) {
  const clip = customClip || warmupNarration[exerciseId];
  const { setGuidance, controls } = useWarmupSoundscape();
  const source = React.useMemo(
    () =>
      customClip
        ? { uri: customClip.url }
        : warmupNarrationAssets[exerciseId] ?? null,
    [customClip?.url, exerciseId]
  );
  const player = useAudioPlayer(source, {
    downloadFirst: true,
    updateInterval: 250,
  });
  const status = useAudioPlayerStatus(player);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const activeRequest = useRef(0);
  useFocusEffect(
    useCallback(
      () => () => {
        activeRequest.current += 1;
        player.pause();
      },
      [player]
    )
  );
  useEffect(() => {
    player.pause();
    setError("");
    setExpanded(false);
  }, [exerciseId, player]);
  useEffect(() => {
    setGuidance(
      status.playing
        ? customClip?.kind === "music"
          ? "music"
          : "voice"
        : "off"
    );
    return () => setGuidance("off");
  }, [status.playing, customClip?.kind, setGuidance]);
  if (!clip) return <View style={styles.card}>{controls}</View>;
  const failed = status.playbackState === "error";
  const toggle = async () => {
    const request = ++activeRequest.current;
    try {
      setError("");
      if (status.playing) {
        player.pause();
        return;
      }
      await AudioModule.setAudioModeAsync({ playsInSilentMode: true });
      if (request !== activeRequest.current) return;
      if (
        status.didJustFinish ||
        (status.duration > 0 && status.currentTime >= status.duration - 0.1)
      )
        await player.seekTo(0);
      if (request === activeRequest.current) player.play();
    } catch {
      setError("Lyden kunne ikke spilles. Du kan fortsatt lese veiledningen.");
    }
  };
  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {customClip
          ? customClip.kind === "music"
            ? "Musikk fra produsenten"
            : "Stemme fra produsenten"
          : "Norsk lydveiledning"}
      </Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            status.playing ? "Pause lydveiledning" : "Spill lydveiledning"
          }
          accessibilityState={{ disabled: !status.isLoaded || failed }}
          disabled={!status.isLoaded || failed}
          onPress={() => void toggle()}
          style={styles.button}
        >
          <Ionicons
            name={status.playing ? "pause" : "play"}
            size={18}
            color={Colors.textPrimary}
          />
          <Text style={styles.text}>
            {failed
              ? "Lyd utilgjengelig"
              : !status.isLoaded
              ? "Laster lyd…"
              : status.playing
              ? "Pause"
              : "Spill av"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start lydveiledningen på nytt"
          disabled={!status.isLoaded || failed}
          onPress={() => {
            player.pause();
            void player
              .seekTo(0)
              .catch(() => setError("Kunne ikke starte på nytt."));
          }}
          style={styles.button}
        >
          <Ionicons name="refresh" size={18} color={Colors.textSecondary} />
          <Text style={styles.text}>Fra start</Text>
        </Pressable>
      </View>
      <Text accessibilityLabel="Tid i lydveiledningen" style={styles.text}>
        {Math.floor(status.currentTime / 60)}:
        {String(Math.floor(status.currentTime % 60)).padStart(2, "0")} /{" "}
        {Math.floor(status.duration / 60)}:
        {String(Math.floor(status.duration % 60)).padStart(2, "0")}
      </Text>
      {!!error && (
        <Text accessibilityRole="alert" style={styles.text}>
          {error}
        </Text>
      )}
      {controls}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((v) => !v)}
        style={styles.button}
      >
        <Text style={styles.text}>
          {expanded ? "Skjul teksten" : "Les veiledningen"}
        </Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={Colors.textSecondary}
        />
      </Pressable>
      {expanded && <Text style={styles.transcript}>{clip.transcript}</Text>}
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    width: "100%",
    padding: 14,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    gap: 8,
  },
  title: { color: Colors.textPrimary, fontWeight: "600", fontSize: 15 },
  text: { color: Colors.textSecondary, fontSize: 14 },
  transcript: { color: Colors.textPrimary, fontSize: 15, lineHeight: 23 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: {
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
