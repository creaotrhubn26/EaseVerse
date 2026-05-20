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
  if (!clerkConfigured) {
    return <NotConfigured />;
  }
  return <SignInForm insetsTop={insets.top} />;
}

function SignInForm({ insetsTop }: { insetsTop: number }) {
  const { signIn, isLoaded, setActive } = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'identifier' | 'code'>('identifier');
  const [mode, setMode] = useState<'password' | 'email_code'>('email_code');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function sendEmailCode() {
    if (!isLoaded || submitting || !email.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const attempt = await signIn.create({ identifier: email.trim() });
      const firstFactor = attempt.supportedFirstFactors?.find(
        (f) => f.strategy === 'email_code',
      ) as { emailAddressId: string; strategy: 'email_code' } | undefined;
      if (!firstFactor) {
        throw new Error('Email-code sign-in not available for this account');
      }
      await signIn.prepareFirstFactor({
        strategy: 'email_code',
        emailAddressId: firstFactor.emailAddressId,
      });
      setStage('code');
    } catch (err) {
      const message =
        (err as { errors?: { message?: string }[] }).errors?.[0]?.message ??
        (err as Error).message ??
        'Could not send code. Check the email and try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyEmailCode() {
    if (!isLoaded || submitting || !code.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const attempt = await signIn.attemptFirstFactor({
        strategy: 'email_code',
        code: code.trim(),
      });
      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId });
        router.replace('/(tabs)');
      } else {
        setError('Additional verification needed. Use a different method.');
      }
    } catch (err) {
      const message =
        (err as { errors?: { message?: string }[] }).errors?.[0]?.message ??
        'Wrong or expired code. Try again or resend.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordSubmit() {
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

  function handlePrimary() {
    if (mode === 'password') return handlePasswordSubmit();
    if (stage === 'identifier') return sendEmailCode();
    return verifyEmailCode();
  }

  const primaryLabel =
    mode === 'password'
      ? 'Sign in'
      : stage === 'identifier'
        ? 'Send code'
        : 'Verify code';

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
        <Text style={styles.subtitle}>
          {mode === 'email_code'
            ? stage === 'identifier'
              ? "We'll email you a 6-digit code."
              : `Enter the code we sent to ${email}.`
            : 'Sign in to sync sessions across devices.'}
        </Text>

        {stage === 'identifier' ? (
          <>
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
              onSubmitEditing={mode === 'password' ? handlePrimary : sendEmailCode}
            />

            {mode === 'password' ? (
              <>
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
                  onSubmitEditing={handlePrimary}
                />
              </>
            ) : null}
          </>
        ) : (
          <>
            <Label>Code</Label>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={Colors.textTertiary}
              autoCapitalize="none"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={6}
              style={styles.input}
              editable={!submitting}
              onSubmitEditing={verifyEmailCode}
              autoFocus
            />
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable onPress={handlePrimary} disabled={submitting} accessibilityRole="button">
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd] as const}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.submit, submitting && styles.submitDisabled]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>{primaryLabel}</Text>
            )}
          </LinearGradient>
        </Pressable>

        {stage === 'code' ? (
          <Pressable
            onPress={() => {
              setStage('identifier');
              setCode('');
              setError(null);
            }}
            disabled={submitting}
            accessibilityRole="button"
            style={styles.linkButton}
          >
            <Text style={styles.footerLink}>Back to email</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => {
              setMode(mode === 'password' ? 'email_code' : 'password');
              setError(null);
            }}
            accessibilityRole="button"
            style={styles.linkButton}
          >
            <Text style={styles.footerLink}>
              {mode === 'password' ? 'Use email code instead' : 'Use password instead'}
            </Text>
          </Pressable>
        )}

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
