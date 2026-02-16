import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View, type ImageSourcePropType } from "react-native";
import React, { useEffect } from "react";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useResponsiveLayout } from "@/lib/responsive";

const tabIconSources = {
  sing: require("@/assets/images/icon-set/Singing.png"),
  lyrics: require("@/assets/images/icon-set/Lyrics.png"),
  sessions: require("@/assets/images/icon-set/sessions.png"),
  profile: require("@/assets/images/icon-set/Profile.png"),
} as const;

function AnimatedTabIcon({
  source,
  focused,
  size,
}: {
  source: ImageSourcePropType;
  focused: boolean;
  size: number;
}) {
  const focusProgress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    focusProgress.value = withTiming(focused ? 1 : 0, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    });
  }, [focusProgress, focused]);

  const wrapStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(focusProgress.value, [0, 1], [0, -2]) },
      { scale: interpolate(focusProgress.value, [0, 1], [1, 1.08]) },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(focusProgress.value, [0, 1], [0, 0.7]),
    transform: [{ scale: interpolate(focusProgress.value, [0, 1], [0.92, 1.06]) }],
  }));

  return (
    <Animated.View
      style={[
        styles.tabIconWrap,
        {
          width: size + 14,
          height: size + 14,
          borderRadius: Math.round((size + 14) * 0.36),
        },
        wrapStyle,
      ]}
    >
      <Animated.View
        style={[
          styles.tabIconGlow,
          {
            width: size + 4,
            height: size + 4,
            borderRadius: Math.round((size + 4) * 0.34),
          },
          glowStyle,
        ]}
      />
      <Animated.Image
        source={source}
        style={[
          styles.tabIcon,
          {
            width: size,
            height: size,
            opacity: focused ? 1 : 0.6,
          },
        ]}
        resizeMode="contain"
        accessible={false}
      />
    </Animated.View>
  );
}

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: "mic", selected: "mic.fill" }} />
        <NativeTabs.Trigger.Label>Sing</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="lyrics">
        <NativeTabs.Trigger.Icon sf={{ default: "doc.text", selected: "doc.text.fill" }} />
        <NativeTabs.Trigger.Label>Lyrics</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="sessions">
        <NativeTabs.Trigger.Icon sf={{ default: "clock", selected: "clock.fill" }} />
        <NativeTabs.Trigger.Label>Sessions</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf={{ default: "person", selected: "person.fill" }} />
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";
  const responsive = useResponsiveLayout();
  const tabIconSize = responsive.navIconSize;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: Colors.tabActive,
        tabBarInactiveTintColor: Colors.tabInactive,
        sceneStyle: { backgroundColor: Colors.background },
        tabBarStyle: {
          // On web, an absolute tab bar can overlap and intercept clicks on content near
          // the bottom of a ScrollView. Keep it in-flow so it's always clickable without
          // blocking content.
          position: isWeb ? ("relative" as const) : ("absolute" as const),
          backgroundColor: isIOS ? "transparent" : Colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: Colors.borderGlass,
          elevation: 0,
          ...(isWeb ? { height: responsive.navBarHeight } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={80}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: Colors.background },
              ]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Sing",
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              source={tabIconSources.sing}
              focused={focused}
              size={tabIconSize}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="lyrics"
        options={{
          title: "Lyrics",
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              source={tabIconSources.lyrics}
              focused={focused}
              size={tabIconSize}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={{
          title: "Sessions",
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              source={tabIconSources.sessions}
              focused={focused}
              size={tabIconSize}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              source={tabIconSources.profile}
              focused={focused}
              size={tabIconSize}
            />
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}

const styles = StyleSheet.create({
  tabIconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  tabIconGlow: {
    position: "absolute",
    backgroundColor: Colors.accentGlow,
  },
  tabIcon: {},
});
