import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ClerkProvider } from "@clerk/clerk-expo";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AppProvider } from "@/lib/AppContext";
import { clerkTokenCache } from "@/lib/clerk-token-cache";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEventListener } from "expo";
import Colors from "@/constants/colors";

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

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
      <Stack.Screen
        name="(auth)"
        options={{
          headerShown: false,
          presentation: "card",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="admin"
        options={{
          headerShown: false,
          presentation: "card",
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="booth/[trackId]"
        options={{
          headerShown: false,
          presentation: "card",
          animation: "fade",
        }}
      />
      <Stack.Screen
        name="projects/index"
        options={{
          headerShown: false,
          presentation: "card",
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="projects/[id]"
        options={{
          headerShown: false,
          presentation: "card",
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="comp/[id]"
        options={{
          headerShown: false,
          presentation: "card",
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="companion"
        options={{
          headerShown: false,
          presentation: "card",
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="session/live/[id]"
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
  const introPlayer = useVideoPlayer(introVideoSource, (p) => {
    p.loop = false;
    p.muted = Platform.OS === "web";
    p.play();
  });

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

  // expo-video: 'playToEnd' tilsvarer expo-av sin didJustFinish; ved feil-status
  // hopper vi rett til appen (samme oppførsel som onError før).
  useEventListener(introPlayer, "playToEnd", () => dismissIntro());
  useEventListener(introPlayer, "statusChange", ({ status }) => {
    if (status === "error") {
      dismissIntro();
    }
  });

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

  const tree = (
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
                  <VideoView
                    player={introPlayer}
                    style={styles.introVideo}
                    // contain (not cover) so the whole intro frame — including
                    // the tagline text — is visible instead of being cropped at
                    // the edges. The overlay is solid black, so the letterbox
                    // bars are invisible.
                    contentFit="contain"
                    nativeControls={false}
                  />
                  <View style={styles.introActions}>
                    {Platform.OS === "web" && introMuted ? (
                      <Pressable
                        onPress={() => {
                          setIntroMuted(false);
                          introPlayer.muted = false;
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
  );

  return (
    <ErrorBoundary>
      {clerkPublishableKey ? (
        <ClerkProvider
          publishableKey={clerkPublishableKey}
          tokenCache={clerkTokenCache}
        >
          {tree}
        </ClerkProvider>
      ) : (
        tree
      )}
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
