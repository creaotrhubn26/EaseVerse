import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import {
  LegalDocumentScreen,
  legalDocumentStyles as styles,
} from "@/components/LegalDocumentScreen";

const sections = [
  {
    title: "Who is responsible",
    body:
      "CREATORHUB AS (organisation number 937 518 684), Søsterveien 11, 1474 Lørenskog, Norway, is responsible for EaseVerse. Privacy enquiries can be sent to support@creatorhubn.com.",
  },
  {
    title: "Data that stays on your device",
    body:
      "EaseVerse stores your songs, lyrics, settings, session metadata and recordings in the app's local storage by default. Local data remains on your device until you delete it in the app or remove the app. Android microphone access is used only when you start a recording, live session or voice-analysis feature.",
  },
  {
    title: "Data we process",
    body:
      "If you sign in, we receive your CreatorHub user ID, name, email address and optional profile image. When you use cloud, collaboration or coaching features, we may process project and take metadata, lyrics, transcripts, comments, performance measurements and audio that you choose to analyse, sync or upload. We also process basic request and security information such as IP address, timestamps and error details.",
  },
  {
    title: "Voice and coaching data",
    body:
      "Audio submitted for Session Scoring or EasePocket analysis is sent securely to the EaseVerse API. Temporary audio conversion files are deleted after processing. Coaching events—including lyrics or transcripts, timing results and practice insights—may be stored under your account or a pseudonymous device identifier to provide history and personalised recommendations. Audio uploaded as a shared take or reference track remains stored until it is deleted or the related account is deleted.",
  },
  {
    title: "Why we use the data",
    body:
      "We use data to provide recording, transcription, coaching, synchronisation and collaboration; operate CreatorHub Workspace and Pro Tools Companion handoffs; secure the service; prevent abuse; and improve reliability. Our legal bases are performance of the service you request, consent for device permissions, legitimate interests in security and product operation, and legal obligations where applicable.",
  },
  {
    title: "Service providers and transfers",
    body:
      "We use Google for CreatorHub sign-in and may use Netlify, Render, managed PostgreSQL, AWS S3 and Backblaze B2 for hosting, processing and storage. Providers process data under their service terms and security controls. Data may be processed outside Norway or the EEA with appropriate transfer safeguards where required.",
  },
  {
    title: "Retention, security and your choices",
    body:
      "We retain cloud data only for as long as needed to provide the service, meet legal obligations and protect the platform. Data is encrypted in transit, authentication tokens are stored in protected device storage, and project access is restricted by membership. You can use the core local workflow without signing in, deny microphone access, delete individual local sessions, sign out, or request deletion of your account and associated data.",
  },
  {
    title: "Your rights",
    body:
      "Depending on applicable law, you may request access, correction, deletion, restriction, portability or objection, and withdraw consent. Contact support@creatorhubn.com. You may also complain to the Norwegian Data Protection Authority (Datatilsynet). EaseVerse is not directed to children under 13 without involvement from a parent or guardian.",
  },
  {
    title: "Changes",
    body:
      "We may update this policy when the app or its providers change. The current version and update date will remain available at easeverse.netlify.app/privacy.",
  },
];

export default function PrivacyScreen() {
  return (
    <LegalDocumentScreen
      eyebrow="EaseVerse · CreatorHub"
      title="Privacy Policy"
      updatedAt="10 September 2026"
      sections={sections}
      footer={
        <View style={styles.note}>
          <Text style={styles.body}>Want us to delete your account and associated data?</Text>
          <Pressable
            onPress={() => router.push("/account-deletion")}
            accessibilityRole="link"
            accessibilityLabel="Open account deletion page"
          >
            <Text style={styles.link}>Open the account deletion page</Text>
          </Pressable>
        </View>
      }
    />
  );
}
