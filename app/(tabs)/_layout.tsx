import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { Image, Platform, StyleSheet, View } from "react-native";
import React from "react";
import Colors from "@/constants/colors";

const tabIconSources = {
  sing: require("@/assets/images/icon-set/Singing.png"),
  lyrics: require("@/assets/images/icon-set/Lyrics.png"),
  sessions: require("@/assets/images/icon-set/sessions.png"),
  profile: require("@/assets/images/icon-set/Profile.png"),
} as const;

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
          ...(isWeb ? { height: 84 } : {}),
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
            <Image
              source={tabIconSources.sing}
              style={[styles.tabIcon, { opacity: focused ? 1 : 0.55 }]}
              resizeMode="cover"
              accessible={false}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="lyrics"
        options={{
          title: "Lyrics",
          tabBarIcon: ({ focused }) => (
            <Image
              source={tabIconSources.lyrics}
              style={[styles.tabIcon, { opacity: focused ? 1 : 0.55 }]}
              resizeMode="cover"
              accessible={false}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={{
          title: "Sessions",
          tabBarIcon: ({ focused }) => (
            <Image
              source={tabIconSources.sessions}
              style={[styles.tabIcon, { opacity: focused ? 1 : 0.55 }]}
              resizeMode="cover"
              accessible={false}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => (
            <Image
              source={tabIconSources.profile}
              style={[styles.tabIcon, { opacity: focused ? 1 : 0.55 }]}
              resizeMode="cover"
              accessible={false}
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
  tabIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
  },
});
