import { Linking, Pressable, Text, View } from "react-native";

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
