import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AppProvider } from "@/lib/AppContext";
import { StatusBar } from "expo-status-bar";
import Colors from "@/constants/colors";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

SplashScreen.preventAutoHideAsync();

const darkContentStyle = { backgroundColor: Colors.background };

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
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

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

    const prefix = window.location.pathname.startsWith("/app") ? "/app" : "";
    const swUrl = `${prefix}/sw.js`;
    const scope = prefix ? `${prefix}/` : "/";

    void navigator.serviceWorker.register(swUrl, { scope }).catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
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
            </AppProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
