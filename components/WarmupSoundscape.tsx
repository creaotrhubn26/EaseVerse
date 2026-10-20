import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useRef,
} from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus, AudioModule } from "expo-audio";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
const Context = createContext({
  setGuidance: (_mode: "off" | "voice" | "music") => {},
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
  useEffect(() => {
    player.loop = true;
    player.volume =
      guidance === "music" ? 0 : guidance === "voice" ? volume * 0.3 : volume;
  }, [player, volume, guidance]);
  useFocusEffect(
    useCallback(
      () => () => {
        activeRequest.current += 1;
        player.pause();
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
        accessibilityRole="button"
        accessibilityLabel={
          status.playing ? "Slå av rolig rytme" : "Slå på rolig rytme"
        }
        accessibilityState={{
          selected: status.playing,
          disabled: !status.isLoaded,
        }}
        disabled={!status.isLoaded}
        onPress={() => void toggle()}
        style={styles.button}
      >
        <Ionicons
          name={status.playing ? "musical-notes" : "musical-notes-outline"}
          size={18}
          color={Colors.gradientMid}
        />
        <Text style={styles.text}>
          Rolig rytme · {status.playing ? "på" : "av"}
        </Text>
      </Pressable>
      <View style={styles.volume}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Senk musikkvolum"
          onPress={() => setVolume((v) => Math.max(0, v - 0.05))}
          style={styles.small}
        >
          <Ionicons name="remove" size={18} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.text}>{Math.round(volume * 100)} %</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Øk musikkvolum"
          onPress={() => setVolume((v) => Math.min(0.4, v + 0.05))}
          style={styles.small}
        >
          <Ionicons name="add" size={18} color={Colors.textPrimary} />
        </Pressable>
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={styles.text}>
          {error}
        </Text>
      )}
    </View>
  );
  return (
    <Context.Provider value={{ setGuidance, controls }}>
      {children}
    </Context.Provider>
  );
}
const styles = StyleSheet.create({
  wrap: { borderTopWidth: 1, borderColor: Colors.borderGlass, paddingTop: 8 },
  button: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  text: { fontSize: 13, color: Colors.textSecondary },
  volume: { flexDirection: "row", alignItems: "center", gap: 8 },
  small: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
