import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AppProvider } from "@/lib/AppContext";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { ResizeMode, Video, AVPlaybackStatus } from "expo-av";
import Colors from "@/constants/colors";

SplashScreen.preventAutoHideAsync();

const darkContentStyle = { backgroundColor: Colors.background };
const introVideoSource = require("@/assets/videos/Easeverse_intro.MP4");
const introFallbackMs = 9000;

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: "Back",
        headerShown: false,
        contentStyle: darkContentStyle,
        animation: "fade",
      }}
    >
      <Stack.Screen
        name="(tabs)"
        options={{ headerShown: false, animation: "none" }}
      />
      <Stack.Screen
        name="session/[id]"
        options={{
          headerShown: false,
          presentation: "card",
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="practice/[id]"
        options={{
          headerShown: false,
          presentation: "card",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="warmup"
        options={{
          headerShown: false,
          presentation: "card",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="mindfulness"
        options={{
          headerShown: false,
          presentation: "card",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="easepocket"
        options={{
          headerShown: false,
          presentation: "card",
          animation: "slide_from_bottom",
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular: require("@/assets/fonts/Inter_400Regular.ttf"),
    Inter_500Medium: require("@/assets/fonts/Inter_500Medium.ttf"),
    Inter_600SemiBold: require("@/assets/fonts/Inter_600SemiBold.ttf"),
    Inter_700Bold: require("@/assets/fonts/Inter_700Bold.ttf"),
  });
  const [showIntro, setShowIntro] = useState(true);
  const [introMuted, setIntroMuted] = useState(Platform.OS === "web");
  const introOpacity = useRef(new Animated.Value(1)).current;
  const introDismissedRef = useRef(false);
  const introVideoRef = useRef<Video | null>(null);

  const dismissIntro = useCallback(() => {
    if (introDismissedRef.current) {
      return;
    }
    introDismissedRef.current = true;
    Animated.timing(introOpacity, {
      toValue: 0,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setShowIntro(false));
  }, [introOpacity]);

  const handleIntroStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) {
        return;
      }
      if (status.didJustFinish) {
        dismissIntro();
      }
    },
    [dismissIntro]
  );

  useEffect(() => {
    if (!showIntro) {
      return;
    }
    const timer = setTimeout(() => {
      dismissIntro();
    }, introFallbackMs);
    return () => clearTimeout(timer);
  }, [dismissIntro, showIntro]);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    if (Platform.OS !== "web" || __DEV__) {
      return;
    }

    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }

    if (!("serviceWorker" in navigator)) {
      return;
    }

    // Web app is served from the root path. "/app" remains a redirect-only legacy alias.
    const swUrl = "/sw.js";
    const scope = "/";

    void navigator.serviceWorker.register(swUrl, { scope }).catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }

    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
      return;
    }

    const nav = navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean };
    nav.vibrate = () => false;
  }, []);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView
          style={{ flex: 1, backgroundColor: Colors.background }}
        >
          <KeyboardProvider>
            <AppProvider>
              <StatusBar style="light" />
              <RootLayoutNav />
              {showIntro ? (
                <Animated.View style={[styles.introOverlay, { opacity: introOpacity }]}>
                  <Video
                    ref={introVideoRef}
                    source={introVideoSource}
                    style={styles.introVideo}
                    shouldPlay
                    isLooping={false}
                    isMuted={introMuted}
                    resizeMode={ResizeMode.COVER}
                    onError={dismissIntro}
                    onPlaybackStatusUpdate={handleIntroStatusUpdate}
                  />
                  <View style={styles.introActions}>
                    {Platform.OS === "web" && introMuted ? (
                      <Pressable
                        onPress={() => {
                          setIntroMuted(false);
                          void introVideoRef.current?.setIsMutedAsync(false);
                        }}
                        style={styles.introActionButton}
                        accessibilityRole="button"
                        accessibilityLabel="Enable intro sound"
                        accessibilityHint="Turns on intro audio"
                      >
                        <Text style={styles.introActionText}>Enable Sound</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={dismissIntro}
                      style={styles.introActionButton}
                      accessibilityRole="button"
                      accessibilityLabel="Skip intro"
                      accessibilityHint="Skips intro and opens the app immediately"
                    >
                      <Text style={styles.introActionText}>Skip</Text>
                    </Pressable>
                  </View>
                </Animated.View>
              ) : null}
            </AppProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  introOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    backgroundColor: "#000",
  },
  introVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  introActions: {
    position: "absolute",
    right: 16,
    bottom: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  introActionButton: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  introActionText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
