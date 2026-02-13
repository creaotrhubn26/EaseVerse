export interface WarmUpTip {
  text: string;
  type: 'do' | 'dont';
}

export interface WarmUpExercise {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  durationSeconds: number;
  instruction: string;
  howTo: string[];
  tips: WarmUpTip[];
  level: 'beginner' | 'all' | 'intermediate';
  category: 'body' | 'breath' | 'vocal' | 'articulation';
  categoryLabel: string;
  categoryColor: string;
}

export const warmUpExercises: WarmUpExercise[] = [
  {
    id: 'body-stretch',
    title: 'Body Release',
    subtitle: 'Loosen up tension before making sound',
    icon: 'body',
    durationSeconds: 60,
    instruction: 'Roll your shoulders, stretch your neck gently side to side, and massage between your jaw and ear in small circles. Shake out your hands.',
    howTo: [
      'Roll shoulders backward 5 times, then forward 5 times',
      'Gently tilt head to each side, hold for 3 seconds',
      'Open and close jaw slowly, then massage the joint area',
      'Shake out your hands and arms to release tension',
    ],
    tips: [
      { text: 'Keep movements slow and gentle', type: 'do' },
      { text: 'Focus on releasing jaw and neck tension', type: 'do' },
      { text: 'Stand with feet hip-width apart for stability', type: 'do' },
      { text: 'Never force your neck past a comfortable range', type: 'dont' },
      { text: 'Skip this step — physical tension becomes vocal tension', type: 'dont' },
    ],
    level: 'all',
    category: 'body',
    categoryLabel: 'Body',
    categoryColor: '#4ADE80',
  },
  {
    id: 'diaphragm-breathing',
    title: 'Diaphragm Breathing',
    subtitle: 'Build your breath support foundation',
    icon: 'leaf',
    durationSeconds: 90,
    instruction: 'Inhale slowly through your nose for 5 seconds, letting your belly expand (not your chest). Hold for 2 seconds. Exhale on a steady "sssss" hiss for 8-10 seconds.',
    howTo: [
      'Place one hand on your chest, one on your belly',
      'Inhale through your nose for 5 seconds — only your belly should move',
      'Hold the breath gently for 2 seconds',
      'Exhale slowly on a "sssss" hiss for 8-10 seconds',
      'Repeat 5-7 cycles, extending the exhale each time',
    ],
    tips: [
      { text: 'Your chest should stay still — only belly moves', type: 'do' },
      { text: 'Extend the hiss a little longer each round', type: 'do' },
      { text: 'Keep shoulders relaxed and dropped', type: 'do' },
      { text: 'Breathe into your chest — this creates tension', type: 'dont' },
      { text: 'Hold your breath so long you get dizzy', type: 'dont' },
      { text: 'Rush through this — breath is your vocal engine', type: 'dont' },
    ],
    level: 'all',
    category: 'breath',
    categoryLabel: 'Breath',
    categoryColor: '#60A5FA',
  },
  {
    id: 'humming',
    title: 'Gentle Humming',
    subtitle: 'Safest way to wake up your vocal cords',
    icon: 'musical-note',
    durationSeconds: 90,
    instruction: 'Close your lips gently, place your tongue behind your bottom front teeth, and hum. Start at a comfortable middle pitch and slowly explore up and down your range.',
    howTo: [
      'Close lips gently (no clenching)',
      'Place tongue tip behind lower front teeth',
      'Hum "hmmmm" at a comfortable middle pitch',
      'Feel the vibration in your face — lips, nose, cheekbones',
      'Slowly glide the hum up a few notes, then back down',
    ],
    tips: [
      { text: 'Feel buzzing in your face and lips — that means good placement', type: 'do' },
      { text: 'Stay in your comfortable range at first', type: 'do' },
      { text: 'Keep your jaw relaxed, not clenched', type: 'do' },
      { text: 'Push for high notes right away — your cords are still cold', type: 'dont' },
      { text: 'Clench your jaw while humming', type: 'dont' },
      { text: 'Hum loudly — keep it gentle and easy', type: 'dont' },
    ],
    level: 'all',
    category: 'vocal',
    categoryLabel: 'Vocal',
    categoryColor: '#FF7A18',
  },
  {
    id: 'lip-trills',
    title: 'Lip Trills',
    subtitle: 'Warm your cords while keeping them relaxed',
    icon: 'water',
    durationSeconds: 90,
    instruction: 'Relax your lips and blow air through them to make a "brrrrr" motorboat sound. Once you have a steady trill, add pitch — slide up and down through your range.',
    howTo: [
      'Relax your lips completely — let them hang loose',
      'Blow a steady stream of air to make a "brrrrr" sound',
      'Keep the trill going for 3-5 seconds at a time',
      'Add pitch: start low, glide up, then glide back down',
      'Try going a little higher each time',
    ],
    tips: [
      { text: 'Keep your face and cheeks relaxed', type: 'do' },
      { text: 'Use steady air pressure from your diaphragm', type: 'do' },
      { text: 'Place fingers gently on your cheeks if the trill keeps stopping', type: 'do' },
      { text: 'Force or strain — if the trill stops, your lips are too tense', type: 'dont' },
      { text: 'Skip the pitch glides — they warm your entire range safely', type: 'dont' },
    ],
    level: 'all',
    category: 'vocal',
    categoryLabel: 'Vocal',
    categoryColor: '#FF7A18',
  },
  {
    id: 'sirens',
    title: 'Vocal Sirens',
    subtitle: 'Smooth out your register transitions',
    icon: 'trending-up',
    durationSeconds: 90,
    instruction: 'Make a continuous "oooh" sound starting at your lowest comfortable note. Glide smoothly up to your highest comfortable note like a siren, then slide back down. The transition between chest and head voice should be seamless.',
    howTo: [
      'Start on your lowest comfortable note with "oooh"',
      'Slowly and smoothly slide upward — like an emergency siren',
      'Pass through your chest voice into your head voice',
      'At the top, reverse and glide back down',
      'Focus on making the transition zone smooth, not cracking',
    ],
    tips: [
      { text: 'Go slow through the "break" between chest and head voice', type: 'do' },
      { text: 'Keep your throat open and relaxed — imagine a yawn', type: 'do' },
      { text: 'A slight crack is normal early on — it will smooth out', type: 'do' },
      { text: 'Push past your comfortable range — pain means stop', type: 'dont' },
      { text: 'Jump between notes — the glide should be continuous', type: 'dont' },
      { text: 'Sing loudly during sirens — keep volume moderate', type: 'dont' },
    ],
    level: 'all',
    category: 'vocal',
    categoryLabel: 'Vocal',
    categoryColor: '#FF7A18',
  },
  {
    id: 'yawn-sigh',
    title: 'Yawn-Sigh',
    subtitle: 'Open your throat and release tension',
    icon: 'happy',
    durationSeconds: 60,
    instruction: 'Inhale as if you are starting a big yawn — feel your throat open wide. Then exhale with a relaxed "ahhh" sigh, letting your voice drop from high to low naturally.',
    howTo: [
      'Take a deep inhale as if starting a real yawn',
      'Feel the back of your throat open up wide',
      'Exhale on a gentle "ahhh" sigh from high pitch down to low',
      'Let the sound be natural and relaxed — no forcing',
      'Repeat 5-6 times, each time letting the throat open more',
    ],
    tips: [
      { text: 'Really commit to the yawn sensation — openness is the goal', type: 'do' },
      { text: 'Let the sigh be lazy and relaxed', type: 'do' },
      { text: 'This is great for releasing performance anxiety too', type: 'do' },
      { text: 'Tighten your throat — the whole point is relaxation', type: 'dont' },
      { text: 'Try to control the sigh — just let it happen', type: 'dont' },
    ],
    level: 'all',
    category: 'vocal',
    categoryLabel: 'Vocal',
    categoryColor: '#FF7A18',
  },
  {
    id: 'vowel-scales',
    title: 'Vowel Warm-Up',
    subtitle: 'Build resonance and mouth positioning',
    icon: 'text',
    durationSeconds: 90,
    instruction: 'Sing each vowel sound — Ah, Eh, Ee, Oh, Ooh — on a sustained comfortable pitch. Hold each for 3-4 seconds. Then try moving through a simple 5-note scale on each vowel.',
    howTo: [
      'Start on a comfortable mid-range pitch',
      'Sing "Ahh" for 4 seconds — drop jaw, tongue flat',
      'Switch to "Ehh" — slightly close the jaw',
      'Move to "Eee" — smile shape, tongue forward',
      'Then "Ohh" — round lips, jaw drops back',
      'Finish with "Ooh" — lips pursed forward',
      'Try each vowel on a 5-note ascending scale',
    ],
    tips: [
      { text: 'Keep your jaw relaxed and open for each vowel', type: 'do' },
      { text: 'Listen for a clear, resonant tone on each vowel', type: 'do' },
      { text: 'Transition between vowels smoothly without stopping', type: 'do' },
      { text: 'Clench or tighten between vowel changes', type: 'dont' },
      { text: 'Rush — give each vowel its full shape', type: 'dont' },
      { text: 'Go too high too fast — stay comfortable first', type: 'dont' },
    ],
    level: 'all',
    category: 'vocal',
    categoryLabel: 'Vocal',
    categoryColor: '#FF7A18',
  },
  {
    id: 'tongue-twisters',
    title: 'Tongue Twisters',
    subtitle: 'Sharpen your articulation and agility',
    icon: 'chatbubbles',
    durationSeconds: 60,
    instruction: 'Speak these tongue twisters slowly at first, then gradually speed up. Focus on crisp consonants and clear vowels. Repeat each 3 times.',
    howTo: [
      '"Red leather, yellow leather" — repeat 3x, speeding up',
      '"Unique New York, unique New York" — repeat 3x',
      '"She sells seashells by the seashore" — repeat 3x',
      '"Peter Piper picked a peck of pickled peppers" — repeat 3x',
      'Start slow, then build speed while keeping clarity',
    ],
    tips: [
      { text: 'Prioritize clarity over speed — clean first, fast second', type: 'do' },
      { text: 'Exaggerate mouth movements to build muscle memory', type: 'do' },
      { text: 'This wakes up your lips, tongue, and soft palate', type: 'do' },
      { text: 'Mumble through them — the point is precise articulation', type: 'dont' },
      { text: 'Skip this thinking it is childish — pros do this daily', type: 'dont' },
    ],
    level: 'all',
    category: 'articulation',
    categoryLabel: 'Articulation',
    categoryColor: '#FBBF24',
  },
];

export interface SafetyRule {
  title: string;
  description: string;
  icon: string;
  type: 'warning' | 'danger' | 'info';
}

export const voiceSafetyRules: SafetyRule[] = [
  {
    title: 'Pain means stop',
    description: 'Any sharp or burning pain in your throat means stop immediately. A slight stretch is OK, pain is not.',
    icon: 'alert-circle',
    type: 'danger',
  },
  {
    title: 'Hydrate with room-temp water',
    description: 'Cold water shocks your vocal cords. Hot water increases mucus. Room temperature water is ideal.',
    icon: 'water',
    type: 'info',
  },
  {
    title: 'Never sing on a cold voice',
    description: 'Always warm up before performing or rehearsing. Singing without warming up is like sprinting without stretching.',
    icon: 'thermometer',
    type: 'warning',
  },
  {
    title: 'Start soft, build up',
    description: 'Begin quietly in your comfortable range. Gradually increase volume and range as your voice warms.',
    icon: 'volume-low',
    type: 'info',
  },
  {
    title: 'Rest when sick',
    description: 'If your throat is sore, swollen, or you have a cold — rest your voice. Pushing through illness can cause lasting damage.',
    icon: 'medkit',
    type: 'danger',
  },
  {
    title: 'Cool down after singing',
    description: 'Gently hum descending notes for 2-3 minutes after an intense session to bring your voice back to rest.',
    icon: 'snow',
    type: 'info',
  },
];

export function getEstimatedDuration(): number {
  return warmUpExercises.reduce((sum, ex) => sum + ex.durationSeconds, 0);
}
