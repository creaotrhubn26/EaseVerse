import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, TextInput, View } from "react-native";
import { router } from 'expo-router';
import { useAuth } from '@/lib/creatorhub-auth';
import { authedFetch } from '@/lib/authed-fetch';

import {
  LegalDocumentScreen,
  legalDocumentStyles as styles,
} from "@/components/LegalDocumentScreen";

const deletionEmail = "support@creatorhubn.com";
const deletionMailUrl =
  `mailto:${deletionEmail}?subject=${encodeURIComponent("Delete my EaseVerse / CreatorHub account")}` +
  `&body=${encodeURIComponent(
    "Please delete my EaseVerse / CreatorHub account and associated app data.\n\nAccount email: \n\nI understand that deletion is permanent.",
  )}`;

const sections = [
  {
    title: "Request permanent deletion",
    body:
      "This page is the deletion pathway for EaseVerse and the shared CreatorHub account used by Workspace and Pro Tools Companion. You can submit a request from inside the app or from this public web page even after uninstalling EaseVerse.",
  },
  {
    title: "What will be deleted",
    body:
      "After we verify account ownership, we will permanently delete the account and associated EaseVerse data we control, including cloud projects, memberships, uploaded takes, lyrics, comments, coaching history and account profile data. This cannot be undone. Other members may retain content they independently own or previously exported.",
  },
  {
    title: "Local data",
    body:
      "You can delete individual recordings from Sessions. Removing EaseVerse from your device deletes app-local settings, projects, session metadata and recordings stored in the app sandbox. A cloud deletion request is still required for synced or uploaded data.",
  },
  {
    title: "Verification and limited retention",
    body:
      "Send the request from the email address connected to your CreatorHub account. We may ask for additional verification to prevent unauthorised deletion. We may retain only data required for legal, fraud-prevention or security obligations and will tell you if that applies.",
  },
];

export default function AccountDeletionScreen() {
  const {isSignedIn, user, getToken} = useAuth();
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState('');
  const locked = useRef(false);
  const requestDeletion = async () => {
    if (locked.current || confirmation !== 'DELETE MY ACCOUNT') return;
    locked.current = true; setBusy(true); setError('');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await authedFetch('/api/account/deletion-request', await getToken(), {
        method: 'POST', signal: controller.signal, body: JSON.stringify({confirmation}),
      });
      const payload = await response.json();
      if (response.status !== 202 || !payload.request?.id || payload.status !== 'requested') throw new Error('Request not saved');
      setReceipt(payload.request.id);
    } catch {
      setError('We could not confirm that your request was saved. Retry safely; duplicate requests use the same reference. Your account has not been deleted.');
    } finally {clearTimeout(timer); locked.current = false; setBusy(false);}
  };
  const sendDeletionRequest = () => {
    void Linking.openURL(deletionMailUrl);
  };

  return (
    <LegalDocumentScreen
      eyebrow="EaseVerse data controls"
      title="Delete account and data"
      sections={sections}
      footer={
        <View>
          <View style={styles.note}>
            {receipt ? <View accessibilityLiveRegion="polite">
              <Text style={styles.body}>Deletion requested. Your account has not been deleted yet. The request is registered for our account-deletion team, including the connected CreatorHub account and data. We may contact your account email to verify ownership.</Text>
              <Text selectable style={styles.link}>Request reference: {receipt}</Text>
            </View> : isSignedIn ? <View style={{gap: 14}}>
              <Text style={styles.body}>Signed in as {user?.email}. This requests permanent deletion of your shared CreatorHub account and the associated EaseVerse data we control. It also affects access to Workspace and Companion. This is not just signing out or deleting local recordings.</Text>
              <Text style={styles.body}>To confirm, type DELETE MY ACCOUNT.</Text>
              <TextInput value={confirmation} onChangeText={setConfirmation} editable={!busy}
                accessibilityLabel="Deletion confirmation" autoCapitalize="characters" autoCorrect={false}
                style={{minHeight: 52, padding: 14, color: '#FFFFFF', borderColor: '#85858D', borderWidth: 1, borderRadius: 12}}/>
              {!!error&&<Text style={styles.body} accessibilityRole="alert">{error}</Text>}
              <Pressable accessibilityRole="button" accessibilityLabel="Request permanent account deletion"
                accessibilityState={{disabled: busy || confirmation !== 'DELETE MY ACCOUNT', busy}}
                disabled={busy || confirmation !== 'DELETE MY ACCOUNT'} onPress={()=>void requestDeletion()}
                style={[styles.action, {minHeight: 52, opacity: busy || confirmation !== 'DELETE MY ACCOUNT' ? 0.5 : 1}]}>
                {busy ? <ActivityIndicator color="#111318"/> : <Text style={styles.actionText}>Request permanent deletion</Text>}
              </Pressable>
            </View> : <View style={{gap: 14}}>
              <Text style={styles.body}>Sign in to submit an account deletion request directly here. If you cannot sign in, use the contact option below.</Text>
              <Pressable accessibilityRole="button" onPress={()=>router.push('/(auth)/sign-in?next=%2Faccount-deletion')} style={styles.action}>
                <Text style={styles.actionText}>Sign in to request deletion</Text>
              </Pressable>
            </View>}
          </View>
          <Pressable
            onPress={sendDeletionRequest}
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.75 }]}
            accessibilityRole="button"
            accessibilityLabel="Email account deletion request"
          >
            <Text style={styles.actionText}>Email deletion request</Text>
          </Pressable>
          <View style={styles.note}>
            <Text style={styles.body}>Request address</Text>
            <Text selectable style={styles.link}>{deletionEmail}</Text>
          </View>
        </View>
      }
    />
  );
}
