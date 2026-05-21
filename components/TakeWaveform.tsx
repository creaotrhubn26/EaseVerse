import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { formatTimestamp } from "@/lib/parse-timestamps";

export type TakeWaveformHandle = {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  loopRegion: (startSec: number, endSec: number) => void;
  clearLoop: () => void;
};

type Props = {
  audioUrl: string;
  markers?: Array<{ seconds: number; label?: string; color?: string }>;
  regions?: Array<{ start: number; end: number; label?: string; color?: string }>;
  height?: number;
  enableDragCreate?: boolean;
  onReady?: (durationSec: number) => void;
  onSeek?: (seconds: number) => void;
  onRegionDrawn?: (startSec: number, endSec: number) => void;
};

// Lazy-load wavesurfer only on web; bail to a plain <audio> on native.
export const TakeWaveform = forwardRef<TakeWaveformHandle, Props>(function TakeWaveform(props, ref) {
  if (Platform.OS !== "web") {
    return null;
  }
  return <TakeWaveformWeb {...props} ref={ref} />;
});

const TakeWaveformWeb = forwardRef<TakeWaveformHandle, Props>(function TakeWaveformWeb(
  { audioUrl, markers = [], regions = [], height = 56, enableDragCreate, onReady, onSeek, onRegionDrawn },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<{
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    destroy: () => void;
    setTime: (s: number) => void;
    play: () => Promise<void>;
    pause: () => void;
    getDuration: () => number;
    getCurrentTime: () => number;
  } | null>(null);
  const loopRef = useRef<{ start: number; end: number } | null>(null);
  const regionsPluginRef = useRef<{
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    enableDragSelection: (opts: { color: string }) => void;
    clearRegions: () => void;
  } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    void (async () => {
      const { default: WaveSurfer } = await import("wavesurfer.js");
      const RegionsPluginMod = enableDragCreate
        ? await import("wavesurfer.js/dist/plugins/regions.js")
        : null;
      if (cancelled || !containerRef.current) return;
      const ws = WaveSurfer.create({
        container: containerRef.current,
        url: audioUrl,
        height,
        waveColor: Colors.textTertiary,
        progressColor: Colors.gradientMid,
        cursorColor: Colors.gradientStart,
        cursorWidth: 2,
        barWidth: 2,
        barGap: 1,
        barRadius: 1,
        normalize: true,
        interact: true,
      }) as unknown as typeof wsRef.current;
      wsRef.current = ws;
      if (RegionsPluginMod && ws) {
        const RegionsPlugin = (RegionsPluginMod as { default?: { create: () => unknown }; create?: () => unknown }).default ?? RegionsPluginMod;
        const regionsPlugin = (RegionsPlugin as { create: () => unknown }).create() as typeof regionsPluginRef.current;
        regionsPluginRef.current = regionsPlugin;
        (ws as unknown as { registerPlugin: (p: unknown) => unknown }).registerPlugin(regionsPlugin);
        regionsPlugin!.enableDragSelection({ color: Colors.gradientStart + "44" });
        regionsPlugin!.on("region-created", (...args: unknown[]) => {
          const region = args[0] as { start: number; end: number; remove: () => void };
          if (onRegionDrawn) onRegionDrawn(region.start, region.end);
          // Remove the visual region from plugin — we render our own overlays
          // after the parent persists it.
          region.remove();
        });
      }
      ws!.on("ready", () => {
        const d = ws!.getDuration();
        setDurationSec(d);
        setLoading(false);
        onReady?.(d);
      });
      ws!.on("audioprocess", () => {
        const t = ws!.getCurrentTime();
        setCurrentSec(t);
        const loop = loopRef.current;
        if (loop && t >= loop.end) {
          ws!.setTime(loop.start);
        }
      });
      ws!.on("seeking", () => setCurrentSec(ws!.getCurrentTime()));
      ws!.on("play", () => setIsPlaying(true));
      ws!.on("pause", () => setIsPlaying(false));
      ws!.on("finish", () => setIsPlaying(false));
      ws!.on("click", () => {
        if (onSeek) onSeek(ws!.getCurrentTime());
      });
    })();
    return () => {
      cancelled = true;
      wsRef.current?.destroy();
      wsRef.current = null;
    };
  }, [audioUrl, height, onReady, onSeek]);

  useImperativeHandle(
    ref,
    () => ({
      seekTo(seconds: number) {
        wsRef.current?.setTime(Math.max(0, seconds));
      },
      play() {
        void wsRef.current?.play();
      },
      pause() {
        wsRef.current?.pause();
      },
      loopRegion(startSec: number, endSec: number) {
        loopRef.current = { start: startSec, end: endSec };
        wsRef.current?.setTime(startSec);
        void wsRef.current?.play();
      },
      clearLoop() {
        loopRef.current = null;
      },
    }),
    [],
  );

  function togglePlay() {
    if (!wsRef.current) return;
    if (isPlaying) wsRef.current.pause();
    else void wsRef.current.play();
  }

  return (
    <View style={styles.box}>
      <View style={styles.controls}>
        <Pressable
          onPress={togglePlay}
          disabled={loading}
          style={styles.playBtn}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Pause" : "Play"}
        >
          <Ionicons name={isPlaying ? "pause" : "play"} size={14} color="#fff" />
        </Pressable>
        <Text style={styles.timeText}>
          {formatTimestamp(currentSec)} / {durationSec ? formatTimestamp(durationSec) : "—"}
        </Text>
      </View>
      <View style={styles.waveWrap}>
        <div ref={containerRef} style={{ width: "100%", minHeight: height }} />
        {durationSec > 0 ? (
          <>
            {regions.map((r, i) => {
              const leftPct = (r.start / durationSec) * 100;
              const widthPct = ((r.end - r.start) / durationSec) * 100;
              return (
                <View
                  key={`region-${i}`}
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${leftPct}%` as unknown as number,
                    width: `${widthPct}%` as unknown as number,
                    backgroundColor: (r.color || Colors.gradientStart) + "33",
                    borderLeftWidth: 2,
                    borderRightWidth: 2,
                    borderLeftColor: r.color || Colors.gradientStart,
                    borderRightColor: r.color || Colors.gradientStart,
                    pointerEvents: "none",
                  }}
                />
              );
            })}
            {markers.map((m, i) => {
              const leftPct = (m.seconds / durationSec) * 100;
              return (
                <View
                  key={`marker-${i}`}
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${leftPct}%` as unknown as number,
                    width: 2,
                    backgroundColor: m.color || Colors.gradientStart,
                    pointerEvents: "none",
                  }}
                />
              );
            })}
          </>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  box: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 100,
  },
  playBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.gradientStart,
    alignItems: "center",
    justifyContent: "center",
  },
  timeText: {
    color: Colors.textTertiary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    minWidth: 64,
  },
  waveWrap: {
    flex: 1,
    position: "relative",
  },
});
