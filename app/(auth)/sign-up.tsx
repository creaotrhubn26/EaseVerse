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
import { useSignUp } from '@clerk/clerk-expo';
import Colors from '@/constants/colors';

const clerkConfigured = Boolean(process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function SignUpScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!clerkConfigured) {
    return (
      <View style={[styles.container, styles.notConfigured]}>
        <Ionicons name="lock-closed" size={32} color={Colors.textTertiary} />
        <Text style={styles.title}>Authentication is not configured</Text>
        <Text style={styles.subtitle}>
          Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to enable sign-up.
        </Text>
      </View>
    );
  }

  return (
    <SignUpForm
      insetsTop={insets.top}
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      code={code}
      setCode={setCode}
      pendingVerification={pendingVerification}
      setPendingVerification={setPendingVerification}
      error={error}
      setError={setError}
      submitting={submitting}
      setSubmitting={setSubmitting}
    />
  );
}

function SignUpForm(props: {
  insetsTop: number;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  code: string;
  setCode: (v: string) => void;
  pendingVerification: boolean;
  setPendingVerification: (v: boolean) => void;
  error: string | null;
  setError: (v: string | null) => void;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
}) {
  const { signUp, isLoaded, setActive } = useSignUp();
  const {
    insetsTop,
    email,
    setEmail,
    password,
    setPassword,
    code,
    setCode,
    pendingVerification,
    setPendingVerification,
    error,
    setError,
    submitting,
    setSubmitting,
  } = props;

  async function handleCreate() {
    if (!isLoaded || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await signUp.create({ emailAddress: email.trim(), password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err) {
      const message =
        (err as { errors?: { message?: string }[] }).errors?.[0]?.message ??
        'Could not start sign-up. Try a different email or password.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify() {
    if (!isLoaded || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId });
        router.replace('/(tabs)');
      } else {
        setError('Verification incomplete. Check the code and try again.');
      }
    } catch (err) {
      const message =
        (err as { errors?: { message?: string }[] }).errors?.[0]?.message ??
        'Verification failed.';
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
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </Pressable>

        {pendingVerification ? (
          <>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to {email}. Enter it below to finish creating your account.
            </Text>

            <Text style={styles.label}>Verification code</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={Colors.textTertiary}
              autoCapitalize="none"
              autoComplete="one-time-code"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={6}
              style={[styles.input, styles.codeInput]}
              editable={!submitting}
              onSubmitEditing={handleVerify}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable onPress={handleVerify} disabled={submitting} accessibilityRole="button">
              <LinearGradient
                colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd] as const}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.submit, submitting && styles.submitDisabled]}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitText}>Verify and finish</Text>
                )}
              </LinearGradient>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.subtitle}>
              We&apos;ll send a verification code to your email.
            </Text>

            <Text style={styles.label}>Email</Text>
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

            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              placeholderTextColor={Colors.textTertiary}
              autoCapitalize="none"
              autoComplete="new-password"
              secureTextEntry
              style={styles.input}
              editable={!submitting}
              onSubmitEditing={handleCreate}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable onPress={handleCreate} disabled={submitting} accessibilityRole="button">
              <LinearGradient
                colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd] as const}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.submit, submitting && styles.submitDisabled]}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitText}>Create account</Text>
                )}
              </LinearGradient>
            </Pressable>

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Already have an account?</Text>
              <Link href="/(auth)/sign-in" replace asChild>
                <Pressable accessibilityRole="link">
                  <Text style={styles.footerLink}>Sign in</Text>
                </Pressable>
              </Link>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 24, paddingBottom: 40, gap: 8 },
  notConfigured: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  backButton: { alignSelf: 'flex-start', padding: 8, marginLeft: -8, marginBottom: 12 },
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
  codeInput: { fontSize: 22, letterSpacing: 4, textAlign: 'center' },
  error: {
    color: Colors.dangerUnderline,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    marginTop: 10,
  },
  submit: { marginTop: 20, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
  },
  footerText: { color: Colors.textSecondary, fontFamily: 'Inter_500Medium', fontSize: 13 },
  footerLink: { color: Colors.gradientStart, fontFamily: 'Inter_700Bold', fontSize: 13 },
});
