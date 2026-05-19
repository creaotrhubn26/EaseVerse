import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useClerk, useUser } from '@clerk/clerk-expo';
import Colors from '@/constants/colors';

const clerkConfigured = Boolean(process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY);

type Props = { horizontalMargin?: number };

export function AccountSection({ horizontalMargin = 16 }: Props) {
  if (!clerkConfigured) return null;
  return <AccountSectionInner horizontalMargin={horizontalMargin} />;
}

function AccountSectionInner({ horizontalMargin }: { horizontalMargin: number }) {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [signingOut, setSigningOut] = React.useState(false);

  if (!isLoaded) {
    return (
      <View style={[styles.card, { marginHorizontal: horizontalMargin }]}>
        <ActivityIndicator color={Colors.textTertiary} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.card, { marginHorizontal: horizontalMargin }]}>
        <View style={styles.headerRow}>
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={20} color={Colors.textTertiary} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>You&apos;re signed out</Text>
            <Text style={styles.subtitle}>Sign in to sync sessions across devices.</Text>
          </View>
        </View>
        <Pressable onPress={() => router.push('/(auth)/sign-in')} accessibilityRole="button">
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd] as const}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </LinearGradient>
        </Pressable>
        <Pressable
          onPress={() => router.push('/(auth)/sign-up')}
          style={styles.secondaryButton}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>Create account</Text>
        </Pressable>
      </View>
    );
  }

  const displayName =
    user.fullName ||
    user.username ||
    user.primaryEmailAddress?.emailAddress ||
    'Signed in';

  return (
    <View style={[styles.card, { marginHorizontal: horizontalMargin }]}>
      <View style={styles.headerRow}>
        <View style={styles.avatarPlaceholder}>
          <Ionicons name="person-circle" size={28} color={Colors.gradientStart} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {displayName}
          </Text>
          {user.primaryEmailAddress ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {user.primaryEmailAddress.emailAddress}
            </Text>
          ) : null}
        </View>
      </View>
      <Pressable
        onPress={async () => {
          if (signingOut) return;
          setSigningOut(true);
          try {
            await signOut();
          } finally {
            setSigningOut(false);
          }
        }}
        disabled={signingOut}
        style={styles.secondaryButton}
        accessibilityRole="button"
      >
        {signingOut ? (
          <ActivityIndicator color={Colors.textPrimary} />
        ) : (
          <Text style={styles.secondaryButtonText}>Sign out</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    gap: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  title: {
    color: Colors.textPrimary,
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  subtitle: {
    color: Colors.textTertiary,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 2,
  },
  primaryButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 },
  secondaryButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  secondaryButtonText: {
    color: Colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
});
