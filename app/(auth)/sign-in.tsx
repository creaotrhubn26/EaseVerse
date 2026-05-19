import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSignIn } from '@clerk/clerk-expo';
import Colors from '@/constants/colors';

const clerkConfigured = Boolean(process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!clerkConfigured) {
    return <NotConfigured />;
  }

  return (
    <SignInForm
      insetsTop={insets.top}
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      error={error}
      setError={setError}
      submitting={submitting}
      setSubmitting={setSubmitting}
    />
  );
}

function SignInForm(props: {
  insetsTop: number;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  error: string | null;
  setError: (v: string | null) => void;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
}) {
  const { signIn, isLoaded, setActive } = useSignIn();
  const {
    insetsTop,
    email,
    setEmail,
    password,
    setPassword,
    error,
    setError,
    submitting,
    setSubmitting,
  } = props;

  async function handleSubmit() {
    if (!isLoaded || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const attempt = await signIn.create({ identifier: email.trim(), password });
      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId });
        router.replace('/(tabs)');
      } else {
        setError('Additional verification needed. Use a different method.');
      }
    } catch (err) {
      const message =
        (err as { errors?: { message?: string }[] }).errors?.[0]?.message ??
        'Sign in failed. Check your credentials and try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insetsTop + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <BackButton />
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to sync sessions across devices.</Text>

        <Label>Email</Label>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={Colors.textTertiary}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
          style={styles.input}
          editable={!submitting}
        />

        <Label>Password</Label>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor={Colors.textTertiary}
          autoCapitalize="none"
          autoComplete="password"
          secureTextEntry
          style={styles.input}
          editable={!submitting}
          onSubmitEditing={handleSubmit}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable onPress={handleSubmit} disabled={submitting} accessibilityRole="button">
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd] as const}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.submit, submitting && styles.submitDisabled]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Sign in</Text>
            )}
          </LinearGradient>
        </Pressable>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Don&apos;t have an account?</Text>
          <Link href="/(auth)/sign-up" replace asChild>
            <Pressable accessibilityRole="link">
              <Text style={styles.footerLink}>Sign up</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function NotConfigured() {
  return (
    <View style={[styles.container, styles.notConfigured]}>
      <Ionicons name="lock-closed" size={32} color={Colors.textTertiary} />
      <Text style={styles.title}>Authentication is not configured</Text>
      <Text style={styles.subtitle}>
        Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your environment to enable sign-in.
      </Text>
      <Pressable onPress={() => router.back()} style={styles.linkButton} accessibilityRole="button">
        <Text style={styles.footerLink}>Go back</Text>
      </Pressable>
    </View>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

function BackButton() {
  return (
    <Pressable
      onPress={() => router.back()}
      style={styles.backButton}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 8,
  },
  notConfigured: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: 8,
    marginLeft: -8,
    marginBottom: 12,
  },
  title: {
    color: Colors.textPrimary,
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    marginBottom: 4,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  label: {
    color: Colors.textSecondary,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
  },
  error: {
    color: Colors.dangerUnderline,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    marginTop: 10,
  },
  submit: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  submitDisabled: {
    opacity: 0.7,
  },
  submitText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
  },
  footerText: {
    color: Colors.textSecondary,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  footerLink: {
    color: Colors.gradientStart,
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  linkButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
});
