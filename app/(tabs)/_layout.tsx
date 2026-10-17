import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { Image, Platform, StyleSheet, View, type ImageSourcePropType } from "react-native";
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
import { AppGate } from "@/components/AppGate";

const tabIconSources = {
  sing: require('@/assets/images/ux-icons-v1/sing.png'),
  lyrics: require('@/assets/images/ux-icons-v1/lyrics.png'),
  sessions: require('@/assets/images/ux-icons-v1/sessions.png'),
  profile: require('@/assets/images/ux-icons-v1/profile.png'),
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
      <Image
        source={source}
        style={[
          styles.tabIcon,
          {
            width: size,
            height: size,
            opacity: focused ? 1 : 0.8,
            tintColor: focused ? Colors.gradientMid : Colors.textSecondary,
          },
        ]}
        resizeMode="contain"
        accessible={false}
      />
    </Animated.View>
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
        tabBarShowLabel: true,
        tabBarActiveTintColor: Colors.tabActive,
        tabBarInactiveTintColor: Colors.tabInactive,
        sceneStyle: { backgroundColor: Colors.background },
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: "Inter_600SemiBold",
          marginTop: 1,
          marginBottom: 2,
        },
        tabBarItemStyle: {
          paddingTop: 5,
        },
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
          tabBarAccessibilityLabel: "Sing tab",
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
          tabBarAccessibilityLabel: "Lyrics tab",
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
          tabBarAccessibilityLabel: "Sessions tab",
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
          tabBarAccessibilityLabel: "Profile tab",
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
  return (
    <AppGate>
      <ClassicTabLayout />
    </AppGate>
  );
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
