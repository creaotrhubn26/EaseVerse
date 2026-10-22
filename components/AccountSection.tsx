import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth, useUser } from '@/lib/creatorhub-auth';
import Colors from '@/constants/colors';


type Props = { horizontalMargin?: number };

export function AccountSection({ horizontalMargin = 16 }: Props) {
  return <AccountSectionInner horizontalMargin={horizontalMargin} />;
}

function AccountSectionInner({ horizontalMargin }: { horizontalMargin: number }) {
  const { user, isLoaded } = useUser();
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = React.useState(false);
  const [photoFailed,setPhotoFailed]=React.useState(false);
  const [error,setError]=React.useState('');
  React.useEffect(()=>{setPhotoFailed(false);setError('');},[user?.id,user?.picture]);

  if (!isLoaded) {
    return (
      <View style={[styles.card, { marginHorizontal: horizontalMargin }]}>
        <ActivityIndicator accessibilityLabel="Loading account" color={Colors.textTertiary} />
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
            <Text style={styles.subtitle}>Connect to Sound Room for shared studio projects. Your local recordings stay on this device.</Text>
          </View>
        </View>
        <Pressable onPress={() => router.push('/(auth)/sign-in')} accessibilityRole="button" accessibilityLabel="Sign in to CreatorHub">
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
          <Text style={styles.secondaryButtonText}>Invited by your producer?</Text>
        </Pressable>
      </View>
    );
  }

  const displayName =
    user.displayName || user.name || user.email || 'Signed in';

  return (
    <View style={[styles.card, { marginHorizontal: horizontalMargin }]}>
      <View style={styles.headerRow}>
        <View style={styles.avatarPlaceholder}>
          {user.picture&&!photoFailed?<Image source={{uri:user.picture}} style={styles.avatarImage} onError={()=>setPhotoFailed(true)} accessible={false}/>:<Text style={styles.initial}>{displayName.trim().charAt(0).toUpperCase()}</Text>}
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={2}>
            {displayName}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {user.email}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={async () => {
          if (signingOut) return;
          setSigningOut(true);setError('');
          try {
            await signOut();
          } catch {setError('Could not confirm sign-out. Please try again.');} finally {
            setSigningOut(false);
          }
        }}
        disabled={signingOut}
        accessibilityLabel="Sign out of CreatorHub"
        style={styles.secondaryButton}
        accessibilityRole="button"
      >
        {signingOut ? (
          <ActivityIndicator color={Colors.textPrimary} />
        ) : (
          <Text style={styles.secondaryButtonText}>Sign out</Text>
        )}
      </Pressable>
      {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 0,
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
  avatarImage:{width:40,height:40,borderRadius:20},initial:{color:Colors.gradientMid,fontSize:20,fontFamily:'Inter_700Bold'},error:{color:Colors.dangerUnderline,fontSize:13,lineHeight:20},
  headerText: { flex: 1,minWidth:0 },
  title: {
    color: Colors.textPrimary,
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  subtitle: {
    color: Colors.textTertiary,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight:19,
    marginTop: 4,
  },
  primaryButton: {
    minHeight:48,
    justifyContent:'center',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: { color: Colors.background, fontFamily: 'Inter_700Bold', fontSize: 14 },
  secondaryButton: {
    minHeight:48,
    justifyContent:'center',
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
