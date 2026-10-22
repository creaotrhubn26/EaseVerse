import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useRef,
} from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus, AudioModule } from "expo-audio";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
const Context = createContext({
  setGuidance: (_mode: "off" | "voice" | "music") => {},
  stopSoundscape: () => {},
  controls: null as React.ReactNode,
});
export const useWarmupSoundscape = () => useContext(Context);
export function WarmupSoundscape({ children }: { children: React.ReactNode }) {
  const player = useAudioPlayer(
    require("../assets/audio/warmups/relaxing-rhythm.mp3"),
    { downloadFirst: true }
  );
  const status = useAudioPlayerStatus(player);
  const [volume, setVolume] = useState(0.18);
  const [guidance, setGuidance] = useState<"off" | "voice" | "music">("off");
  const [error, setError] = useState("");
  const activeRequest = useRef(0);
  const stopSoundscape = useCallback(() => {
    activeRequest.current += 1;
    try {
      player.pause();
    } catch {
      /* Already released on navigation. */
    }
  }, [player]);
  useEffect(() => {
    player.loop = true;
    player.volume =
      guidance === "music" ? 0 : guidance === "voice" ? volume * 0.3 : volume;
  }, [player, volume, guidance]);
  useFocusEffect(
    useCallback(
      () => () => {
        activeRequest.current += 1;
        try {
          player.pause();
        } catch {
          /* Already released on navigation. */
        }
      },
      [player]
    )
  );
  const toggle = async () => {
    const request = ++activeRequest.current;
    try {
      setError("");
      if (status.playing) player.pause();
      else {
        await AudioModule.setAudioModeAsync({ playsInSilentMode: true });
        if (request === activeRequest.current) player.play();
      }
    } catch {
      setError("Rytmen kunne ikke spilles. Du kan fortsette uten musikk.");
    }
  };
  const controls = (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Rolig bakgrunnslyd"
        aria-checked={status.playing}
        accessibilityState={{
          checked: status.playing,
          disabled: !status.isLoaded,
        }}
        disabled={!status.isLoaded}
        onPress={() => void toggle()}
        {...(Platform.OS === "web"
          ? {
              onKeyDown: (event: React.KeyboardEvent) => {
                // RN Web handles Enter for a switch role, but not Space.
                if (event.key === " " && status.isLoaded) {
                  event.preventDefault();
                  void toggle();
                }
              },
            }
          : {})}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View style={styles.icon}>
          <Ionicons
            name="musical-notes-outline"
            size={18}
            color={Colors.gradientMid}
          />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Rolig bakgrunnslyd</Text>
          <Text style={styles.text}>
            {status.playing
              ? guidance === "music"
                ? "Dempet mens din musikk spiller"
                : "På · senkes under veiledningen"
              : "Valgfritt, bare for deg"}
          </Text>
        </View>
        <View
          pointerEvents="none"
          style={[styles.switchTrack, status.playing && styles.switchOn]}
        >
          <View
            style={[styles.switchThumb, status.playing && styles.thumbOn]}
          />
        </View>
      </Pressable>
      {status.playing && (
        <View style={styles.volume}>
          <Text style={styles.volumeLabel}>Volum</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Senk musikkvolum"
            accessibilityState={{ disabled: volume <= 0 }}
            disabled={volume <= 0}
            onPress={() => setVolume((v) => Math.max(0, v - 0.05))}
            style={({ pressed }) => [styles.small, pressed && styles.pressed]}
          >
            <Ionicons name="remove" size={18} color={Colors.textPrimary} />
          </Pressable>
          <Text accessibilityLiveRegion="polite" style={styles.value}>
            {Math.round(volume * 100)} %
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Øk musikkvolum"
            accessibilityState={{ disabled: volume >= 0.4 }}
            disabled={volume >= 0.4}
            onPress={() => setVolume((v) => Math.min(0.4, v + 0.05))}
            style={({ pressed }) => [styles.small, pressed && styles.pressed]}
          >
            <Ionicons name="add" size={18} color={Colors.textPrimary} />
          </Pressable>
        </View>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
  return (
    <Context.Provider value={{ setGuidance, stopSoundscape, controls }}>
      {children}
    </Context.Provider>
  );
}
const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: 18,
    padding: 14,
  },
  row: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10 },
  icon: { width: 32, alignItems: "center" },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 14, fontWeight: "600", color: Colors.textPrimary },
  text: { fontSize: 12, lineHeight: 18, color: Colors.textTertiary },
  switchTrack: {
    width: 42,
    height: 24,
    borderRadius: 12,
    padding: 3,
    backgroundColor: Colors.borderGlass,
  },
  switchOn: { backgroundColor: Colors.gradientStart },
  switchThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.textPrimary,
  },
  thumbOn: { alignSelf: "flex-end" },
  volume: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderTopWidth: 1,
    borderColor: Colors.borderGlass,
    marginTop: 12,
    paddingTop: 8,
  },
  volumeLabel: { flex: 1, fontSize: 13, color: Colors.textSecondary },
  value: {
    minWidth: 46,
    textAlign: "center",
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    color: Colors.textPrimary,
  },
  small: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: Colors.surfaceGlass,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.65 },
  error: {
    fontSize: 13,
    lineHeight: 20,
    color: Colors.textSecondary,
    marginTop: 10,
  },
});
