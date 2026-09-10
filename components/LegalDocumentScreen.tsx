import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useResponsiveLayout } from "@/lib/responsive";

export type LegalSection = {
  title: string;
  body: ReactNode;
};

export function LegalDocumentScreen({
  eyebrow,
  title,
  updatedAt,
  sections,
  footer,
}: {
  eyebrow: string;
  title: string;
  updatedAt?: string;
  sections: LegalSection[];
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const responsive = useResponsiveLayout();

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/profile");
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 20),
            paddingBottom: Math.max(insets.bottom, 24) + 24,
            paddingHorizontal: responsive.contentPadding,
          },
        ]}
      >
        <View style={[styles.inner, { maxWidth: responsive.cardMaxWidth }]}>
          <Pressable
            onPress={goBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Feather name="arrow-left" size={22} color={Colors.textPrimary} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          {updatedAt ? <Text style={styles.updated}>Last updated: {updatedAt}</Text> : null}

          <View style={styles.card}>
            {sections.map((section, index) => (
              <View
                key={section.title}
                style={[styles.section, index > 0 && styles.sectionBorder]}
              >
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {typeof section.body === "string" ? (
                  <Text style={styles.body}>{section.body}</Text>
                ) : (
                  section.body
                )}
              </View>
            ))}
          </View>

          {footer}
        </View>
      </ScrollView>
    </View>
  );
}

export const legalDocumentStyles = StyleSheet.create({
  body: {
    color: Colors.textSecondary,
    fontSize: 15,
    lineHeight: 23,
  },
  link: {
    color: Colors.gradientMid,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "600",
  },
  action: {
    alignItems: "center",
    backgroundColor: Colors.gradientStart,
    borderRadius: 14,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 54,
    paddingHorizontal: 20,
  },
  actionText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  note: {
    backgroundColor: Colors.surfaceGlass,
    borderColor: Colors.borderGlass,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
  },
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,
    flex: 1,
  },
  content: {
    alignItems: "center",
  },
  inner: {
    alignSelf: "center",
    width: "100%",
  },
  backButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
    paddingRight: 12,
  },
  pressed: {
    opacity: 0.7,
  },
  backText: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  eyebrow: {
    color: Colors.gradientMid,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.4,
    marginTop: 28,
    textTransform: "uppercase",
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 36,
    fontWeight: "700",
    lineHeight: 42,
    marginTop: 8,
  },
  updated: {
    color: Colors.textTertiary,
    fontSize: 14,
    marginTop: 10,
  },
  card: {
    backgroundColor: Colors.surface,
    borderColor: Colors.borderGlass,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 28,
    overflow: "hidden",
  },
  section: {
    padding: 20,
  },
  sectionBorder: {
    borderTopColor: Colors.borderGlass,
    borderTopWidth: 1,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24,
    marginBottom: 8,
  },
  body: legalDocumentStyles.body,
});
