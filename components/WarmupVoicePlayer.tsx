import React, { useCallback, useEffect, useState, useRef } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus, AudioModule } from "expo-audio";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useWarmupSoundscape } from "@/components/WarmupSoundscape";
import { warmupNarration } from "@/constants/warmup-narration";
import { warmupNarrationAssets } from "@/constants/warmup-narration-assets";

const time = (seconds: number) => {
  const value = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
};

export function WarmupVoicePlayer({
  exerciseId,
  customClip,
  showTranscript = true,
}: {
  exerciseId: string;
  customClip?: {
    url: string;
    title: string;
    transcript: string;
    kind?: "voice" | "music";
  };
  showTranscript?: boolean;
}) {
  const clip = customClip || warmupNarration[exerciseId];
  const { setGuidance, controls } = useWarmupSoundscape();
  const customUrl = customClip?.url;
  const source = React.useMemo(
    () =>
      customUrl
        ? { uri: customUrl }
        : warmupNarrationAssets[exerciseId] ?? null,
    [customUrl, exerciseId]
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
        // Expo may release the native player before the navigation cleanup runs.
        try {
          player.pause();
        } catch {
          /* Already released. */
        }
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
  if (!clip) return <View style={styles.stack}>{controls}</View>;
  const failed = status.playbackState === "error";
  const isMusic = customClip?.kind === "music";
  const disabled = !status.isLoaded || failed;
  const title = customClip
    ? isMusic
      ? "Musikk fra produsenten"
      : "Stemme fra produsenten"
    : "Norsk lydveiledning";
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
  const progress =
    status.duration > 0
      ? Math.min(1, Math.max(0, status.currentTime / status.duration))
      : 0;
  return (
    <View style={styles.stack}>
      <View style={styles.card}>
        <View style={styles.source}>
          <View style={styles.sourceIcon}>
            <Ionicons
              name={isMusic ? "musical-notes-outline" : "mic-outline"}
              size={18}
              color={Colors.gradientMid}
            />
          </View>
          <View style={styles.sourceText}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.caption}>
              {customClip
                ? "Valgt til denne oppvarmingen"
                : "Lytt, og øv i ditt eget tempo"}
            </Text>
          </View>
        </View>
        <View style={styles.transport}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              status.playing
                ? isMusic
                  ? "Pause musikk"
                  : "Pause lydveiledning"
                : isMusic
                ? "Spill musikk"
                : "Spill lydveiledning"
            }
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => void toggle()}
            style={({ pressed }) => [
              styles.play,
              disabled && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={status.playing ? "pause" : "play"}
              size={27}
              color={Colors.background}
            />
          </Pressable>
          <View style={styles.playState}>
            <Text style={styles.stateTitle}>
              {failed
                ? "Lyd utilgjengelig"
                : !status.isLoaded
                ? "Laster lyd…"
                : status.playing
                ? "Spiller av"
                : status.currentTime > 0 && !status.didJustFinish
                ? "Fortsett å lytte"
                : status.didJustFinish
                ? "Lytt igjen"
                : isMusic
                ? "Lytt til musikken"
                : "Lytt til veiledningen"}
            </Text>
            <Text style={styles.caption}>
              {isMusic ? "Musikk til øvelsen" : "Du kan pause når du vil"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start lydveiledningen på nytt"
            disabled={disabled}
            onPress={() => {
              player.pause();
              void player
                .seekTo(0)
                .catch(() => setError("Kunne ikke starte på nytt."));
            }}
            style={({ pressed }) => [styles.restart, pressed && styles.pressed]}
          >
            <Ionicons
              name="refresh-outline"
              size={22}
              color={disabled ? Colors.textTertiary : Colors.textSecondary}
            />
          </Pressable>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Fremdrift i lydveiledningen"
          aria-valuemin={0}
          aria-valuemax={Math.round(status.duration || 0)}
          aria-valuenow={Math.round(status.currentTime || 0)}
          aria-valuetext={`${time(status.currentTime)} av ${
            status.duration > 0 ? time(status.duration) : "ukjent lengde"
          }`}
          accessibilityValue={{
            min: 0,
            max: Math.round(status.duration || 0),
            now: Math.round(status.currentTime || 0),
            text: `${time(status.currentTime)} av ${time(status.duration)}`,
          }}
          style={styles.track}
        >
          <View style={[styles.elapsed, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.times}>
          <Text style={styles.time}>{time(status.currentTime)}</Text>
          <Text style={styles.time}>
            {status.duration > 0 ? time(status.duration) : "–:––"}
          </Text>
        </View>
        {!!error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        {showTranscript && (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              aria-expanded={expanded}
              onPress={() => setExpanded((v) => !v)}
              style={styles.disclosure}
            >
              <Ionicons
                name="document-text-outline"
                size={17}
                color={Colors.textSecondary}
              />
              <Text style={styles.disclosureText}>
                {expanded
                  ? "Skjul veiledningsteksten"
                  : "Les veiledningsteksten"}
              </Text>
              <Ionicons
                name={expanded ? "chevron-up" : "chevron-down"}
                size={17}
                color={Colors.textSecondary}
              />
            </Pressable>
            {expanded && (
              <Text style={styles.transcript}>{clip.transcript}</Text>
            )}
          </>
        )}
      </View>
      {controls}
    </View>
  );
}
const styles = StyleSheet.create({
  stack: { width: "100%", gap: 12 },
  card: {
    width: "100%",
    padding: 18,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  source: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 22,
  },
  sourceIcon: {
    height: 36,
    width: 36,
    borderRadius: 12,
    backgroundColor: Colors.accentSubtle,
    justifyContent: "center",
    alignItems: "center",
  },
  sourceText: { flex: 1, minWidth: 0, gap: 3 },
  title: { color: Colors.textPrimary, fontWeight: "600", fontSize: 14 },
  caption: { color: Colors.textTertiary, fontSize: 12, lineHeight: 18 },
  transport: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 22,
  },
  play: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.gradientStart,
    justifyContent: "center",
    alignItems: "center",
  },
  playState: { flex: 1, minWidth: 0, gap: 4 },
  stateTitle: { fontSize: 15, fontWeight: "600", color: Colors.textPrimary },
  restart: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderGlass,
    overflow: "hidden",
  },
  elapsed: {
    height: "100%",
    backgroundColor: Colors.gradientMid,
    borderRadius: 2,
  },
  times: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  time: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  disclosure: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    gap: 8,
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.borderGlass,
    paddingTop: 8,
  },
  disclosureText: { flex: 1, fontSize: 13, color: Colors.textSecondary },
  transcript: {
    color: Colors.textPrimary,
    fontSize: 15,
    lineHeight: 24,
    marginTop: 10,
  },
  error: {
    color: Colors.textPrimary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
});
