import {Linking, Pressable, Text} from 'react-native';
import {LegalDocumentScreen, legalDocumentStyles as styles} from '@/components/LegalDocumentScreen';

export default function SupportScreen() {
  return <LegalDocumentScreen eyebrow="EaseVerse help" title="Support" sections={[
    {title:'Recording and playback',body:'Allow microphone access when you start recording. Saved takes appear in Sessions. Check your device volume and selected audio output if you cannot hear playback. Your local recordings are not automatically shared with a producer.'},
    {title:'Lyrics and word examples',body:'The word comparison uses recognised text and can mishear singing or background music. It does not assess pronunciation or musical timing. Tap a whole word row to hear a device-voice example; this is not audio from your recording. Install a matching speech voice in your device settings if asked.'},
    {title:'Joining a studio project',body:'Use your personal invitation from the producer and the email address it was sent to. Each artist and band member uses their own account. Contact the producer if an invitation has expired or uses a different address.'},
    {title:'Get in touch',body:'Email support@creatorhubn.com with the app version, device model and the steps that led to the problem. Do not send passwords, sign-in codes or private recordings unless we have agreed a secure way to share them.'},
  ]} footer={<Pressable accessibilityRole="button" accessibilityLabel="Email EaseVerse support" style={styles.action} onPress={()=>void Linking.openURL('mailto:support@creatorhubn.com?subject=EaseVerse%20support')}><Text style={styles.actionText}>Email support</Text></Pressable>}/>;
}
