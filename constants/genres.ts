import Colors from './colors';

export type GenreId = 'pop' | 'jazz' | 'rnb' | 'rock' | 'classical' | 'hiphop' | 'country' | 'soul';

export interface VocalTechnique {
  name: string;
  description: string;
}

export interface WordRule {
  pattern: RegExp;
  tip: string;
  genreSpecific: boolean;
}

export interface GenreProfile {
  id: GenreId;
  label: string;
  icon: string;
  color: string;
  accentColor: string;
  description: string;
  vocalStyle: string;
  techniques: VocalTechnique[];
  coachHints: string[];
  wordRules: WordRule[];
  timingStyle: string;
  breathingTip: string;
}

const genreProfiles: Record<GenreId, GenreProfile> = {
  pop: {
    id: 'pop',
    label: 'Pop',
    icon: 'musical-notes',
    color: '#FF7A18',
    accentColor: 'rgba(255,122,24,0.15)',
    description: 'Clean, bright, forward tone',
    vocalStyle: 'Clear enunciation, forward placement, bright vowels',
    techniques: [
      { name: 'Belt', description: 'Project from the chest with power on high notes' },
      { name: 'Riffs', description: 'Quick ornamental runs between notes' },
      { name: 'Breathy Tone', description: 'Light, airy delivery for intimate phrases' },
    ],
    coachHints: [
      'Keep it bright and forward',
      'Punch the consonants',
      'Clean vowel transitions',
      'Don\'t swallow the T',
      'Lighter vibrato',
      'Belt from the chest',
      'Smooth the riff',
      'Breathe at the comma',
    ],
    wordRules: [
      { pattern: /night|light|right|tonight/i, tip: 'Crisp final T — pop clarity', genreSpecific: true },
      { pattern: /love|above|dove/i, tip: 'Open, bright "uh" vowel', genreSpecific: true },
      { pattern: /baby|maybe|crazy/i, tip: 'Keep the Y ending light and lifted', genreSpecific: true },
      { pattern: /feel|real|steal/i, tip: 'Sustain the "ee" vowel cleanly', genreSpecific: true },
      { pattern: /heart|start|part/i, tip: 'Forward "ah" — don\'t drop back', genreSpecific: true },
    ],
    timingStyle: 'On the beat — tight and precise',
    breathingTip: 'Quick catch breaths between phrases',
  },
  jazz: {
    id: 'jazz',
    label: 'Jazz',
    icon: 'cafe',
    color: '#A78BFA',
    accentColor: 'rgba(167,139,250,0.15)',
    description: 'Relaxed, swung, expressive phrasing',
    vocalStyle: 'Behind-the-beat feel, scat syllables, dark vowels',
    techniques: [
      { name: 'Scatting', description: 'Improvised nonsense syllables (doo-ba-dee)' },
      { name: 'Swing Feel', description: 'Lay behind the beat with a triplet pulse' },
      { name: 'Vibrato Control', description: 'Delayed vibrato — start straight, bloom late' },
    ],
    coachHints: [
      'Lay back on the beat',
      'Darken the vowel',
      'Delayed vibrato',
      'Slide into the note',
      'Scat-ready consonants',
      'Swing the eighth notes',
      'Relax the jaw',
      'Phrase across bar lines',
    ],
    wordRules: [
      { pattern: /night|light|right|tonight/i, tip: 'Soften the T — let it fade', genreSpecific: true },
      { pattern: /love|above|dove/i, tip: 'Dark, round "uh" — almost "awv"', genreSpecific: true },
      { pattern: /moon|blue|you/i, tip: 'Round and dark "oo" vowel', genreSpecific: true },
      { pattern: /feel|real|steal/i, tip: 'Glide into it — no hard attack', genreSpecific: true },
      { pattern: /baby|maybe|lady/i, tip: 'Swing the syllables — bAY-bee', genreSpecific: true },
    ],
    timingStyle: 'Behind the beat — relaxed and swung',
    breathingTip: 'Long breaths between phrases, use pauses expressively',
  },
  rnb: {
    id: 'rnb',
    label: 'R&B',
    icon: 'heart',
    color: '#F472B6',
    accentColor: 'rgba(244,114,182,0.15)',
    description: 'Smooth, melismatic, soulful',
    vocalStyle: 'Runs and melisma, head voice falsetto, emotional dynamics',
    techniques: [
      { name: 'Melisma', description: 'Singing multiple notes on a single syllable' },
      { name: 'Falsetto Flip', description: 'Smoothly switch between chest and head voice' },
      { name: 'Ad-libs', description: 'Emotional fills between main lyrics' },
    ],
    coachHints: [
      'Smooth the run',
      'Flip to falsetto gently',
      'Add a turn on the vowel',
      'Slide between notes',
      'Breathier on the verse',
      'Full voice on the hook',
      'Delayed vibrato bloom',
      'Connect the run notes',
    ],
    wordRules: [
      { pattern: /night|light|right|tonight/i, tip: 'Melt the final T — let it dissolve', genreSpecific: true },
      { pattern: /love|above|dove/i, tip: 'Melisma on "uh" — add a 3-note turn', genreSpecific: true },
      { pattern: /baby|maybe|crazy/i, tip: 'Run on the second syllable', genreSpecific: true },
      { pattern: /feel|real|steal/i, tip: 'Falsetto flip on the "ee"', genreSpecific: true },
      { pattern: /heart|start|part/i, tip: 'Chest voice growl on "ah"', genreSpecific: true },
    ],
    timingStyle: 'Loose groove — behind the beat on verses',
    breathingTip: 'Breathy inhales as texture between phrases',
  },
  rock: {
    id: 'rock',
    label: 'Rock',
    icon: 'flash',
    color: '#EF4444',
    accentColor: 'rgba(239,68,68,0.15)',
    description: 'Raw, powerful, gritty edge',
    vocalStyle: 'Chest voice power, rasp, aggressive consonants',
    techniques: [
      { name: 'Grit/Rasp', description: 'Controlled distortion for emotional intensity' },
      { name: 'Power Belt', description: 'Full-volume chest voice projection' },
      { name: 'Scream Technique', description: 'Safe, supported high-intensity vocals' },
    ],
    coachHints: [
      'Drive from the diaphragm',
      'Attack the consonants',
      'Add grit on the chorus',
      'Raw vowel — don\'t polish',
      'Explode on the downbeat',
      'Drop the jaw for power',
      'Sustain with chest voice',
      'Hard stop at phrase end',
    ],
    wordRules: [
      { pattern: /night|light|right|tonight/i, tip: 'Hard T attack — punch it', genreSpecific: true },
      { pattern: /love|above|dove/i, tip: 'Wide "uh" — shout quality', genreSpecific: true },
      { pattern: /fire|desire|higher/i, tip: 'Open and roar on "eye-er"', genreSpecific: true },
      { pattern: /feel|real|steal/i, tip: 'Sustain and belt the "ee"', genreSpecific: true },
      { pattern: /break|shake|wake/i, tip: 'Hard K consonant at the end', genreSpecific: true },
    ],
    timingStyle: 'On or ahead of the beat — driving energy',
    breathingTip: 'Big belly breaths, power from the core',
  },
  classical: {
    id: 'classical',
    label: 'Classical',
    icon: 'flower',
    color: '#60A5FA',
    accentColor: 'rgba(96,165,250,0.15)',
    description: 'Rounded, resonant, precise diction',
    vocalStyle: 'Legato, tall vowels, precise consonants, vibrato',
    techniques: [
      { name: 'Legato', description: 'Seamlessly connect notes without breaks' },
      { name: 'Vibrato', description: 'Steady, consistent oscillation on sustained notes' },
      { name: 'Diction', description: 'Precise consonant placement for clarity' },
    ],
    coachHints: [
      'Tall vowel — drop the jaw',
      'Legato between phrases',
      'Consistent vibrato speed',
      'Forward consonant placement',
      'Breath support from below',
      'Round the tone',
      'Release on the beat',
      'Pure vowel — no diphthong',
    ],
    wordRules: [
      { pattern: /night|light|right|tonight/i, tip: 'Precise T release — classical diction', genreSpecific: true },
      { pattern: /love|above|dove/i, tip: 'Tall "ah" vowel — drop the jaw', genreSpecific: true },
      { pattern: /moon|blue|you/i, tip: 'Pure "oo" — no glide', genreSpecific: true },
      { pattern: /feel|real|steal/i, tip: 'Open "ee" — space behind the tongue', genreSpecific: true },
      { pattern: /sing|ring|bring/i, tip: 'Forward nasal resonance on "ng"', genreSpecific: true },
    ],
    timingStyle: 'Precise — follow the conductor/score',
    breathingTip: 'Deep diaphragmatic support, plan breath marks',
  },
  hiphop: {
    id: 'hiphop',
    label: 'Hip-Hop',
    icon: 'mic',
    color: '#FBBF24',
    accentColor: 'rgba(251,191,36,0.15)',
    description: 'Rhythmic, percussive, flow-driven',
    vocalStyle: 'Rhythmic precision, percussive consonants, flow patterns',
    techniques: [
      { name: 'Flow', description: 'Rhythmic pattern that rides the beat' },
      { name: 'Breath Control', description: 'Sustain rapid-fire delivery without gasping' },
      { name: 'Emphasis', description: 'Strategic word stress for impact' },
    ],
    coachHints: [
      'Ride the pocket',
      'Percussive P and B',
      'Clip the ends for flow',
      'Land on the snare',
      'Double-time the verse',
      'Lay back on the hook',
      'Punch the rhyme word',
      'Breath between bars',
    ],
    wordRules: [
      { pattern: /night|light|right|tonight/i, tip: 'Clip to "nigh" — keep the flow', genreSpecific: true },
      { pattern: /love|above|dove/i, tip: 'Quick "luv" — no sustain', genreSpecific: true },
      { pattern: /feel|real|steal/i, tip: 'Punch the rhyme — emphasis on landing', genreSpecific: true },
      { pattern: /rhythm|system|listen/i, tip: 'Percussive consonants — drum it', genreSpecific: true },
      { pattern: /money|honey|funny/i, tip: 'Clip the second syllable tight', genreSpecific: true },
    ],
    timingStyle: 'In the pocket — syncopated with the beat',
    breathingTip: 'Quick catch breaths, plan gaps in the flow',
  },
  country: {
    id: 'country',
    label: 'Country',
    icon: 'sunny',
    color: '#F59E0B',
    accentColor: 'rgba(245,158,11,0.15)',
    description: 'Warm, twangy, storytelling style',
    vocalStyle: 'Nasal twang, vowel bending, conversational delivery',
    techniques: [
      { name: 'Twang', description: 'Forward nasal resonance for brightness' },
      { name: 'Vowel Bending', description: 'Stretch and slide vowels for character' },
      { name: 'Talk-Singing', description: 'Conversational, storytelling delivery' },
    ],
    coachHints: [
      'Add some twang',
      'Bend that vowel',
      'Tell the story',
      'Conversational tone',
      'Slide into the note',
      'Nasal resonance forward',
      'Stretch the diphthong',
      'Keep it honest and raw',
    ],
    wordRules: [
      { pattern: /night|light|right|tonight/i, tip: 'Stretch to "nah-eet" — country diphthong', genreSpecific: true },
      { pattern: /love|above|dove/i, tip: 'Twangy "luuuv" — stretch it', genreSpecific: true },
      { pattern: /heart|start|part/i, tip: 'Drop the R slightly — "haht"', genreSpecific: true },
      { pattern: /home|road|alone/i, tip: 'Bend the "oh" into a diphthong', genreSpecific: true },
      { pattern: /down|town|around/i, tip: 'Slide the "ow" sound — linger', genreSpecific: true },
    ],
    timingStyle: 'Relaxed shuffle or straight — storytelling pace',
    breathingTip: 'Natural breath points like speaking, not forced',
  },
  soul: {
    id: 'soul',
    label: 'Soul',
    icon: 'flame',
    color: '#8B5CF6',
    accentColor: 'rgba(139,92,246,0.15)',
    description: 'Raw emotion, powerful dynamics, call and response',
    vocalStyle: 'Dynamic range, gospel inflections, emotional weight',
    techniques: [
      { name: 'Gospel Growl', description: 'Vocal fry into a powerful note for emotion' },
      { name: 'Dynamic Swell', description: 'Build from whisper to full voice within a phrase' },
      { name: 'Call & Response', description: 'Echo and answer melodic phrases' },
    ],
    coachHints: [
      'Build to the climax',
      'Start soft, end loud',
      'Gospel growl on entry',
      'Let the emotion lead',
      'Dynamic swell here',
      'Call and response phrasing',
      'Weight on every word',
      'Vibrato with feeling',
    ],
    wordRules: [
      { pattern: /night|light|right|tonight/i, tip: 'Build intensity through the word', genreSpecific: true },
      { pattern: /love|above|dove/i, tip: 'Gospel growl into "luuuv"', genreSpecific: true },
      { pattern: /feel|real|steal/i, tip: 'Dynamic swell on the "ee"', genreSpecific: true },
      { pattern: /soul|whole|control/i, tip: 'Full voice — let it resonate', genreSpecific: true },
      { pattern: /pain|rain|again/i, tip: 'Cry quality — thin the vowel', genreSpecific: true },
    ],
    timingStyle: 'Behind the beat — heavy and emotional',
    breathingTip: 'Deep, supported breaths — let silences speak',
  },
};

export const genreList: GenreProfile[] = Object.values(genreProfiles);

export function getGenreProfile(id: GenreId): GenreProfile {
  return genreProfiles[id] || genreProfiles.pop;
}

export function getGenreCoachHints(id: GenreId): string[] {
  return genreProfiles[id]?.coachHints || genreProfiles.pop.coachHints;
}

export function getWordTipForGenre(word: string, genreId: GenreId): string | null {
  const profile = genreProfiles[genreId];
  if (!profile) return null;
  for (const rule of profile.wordRules) {
    if (rule.pattern.test(word)) {
      return rule.tip;
    }
  }
  return null;
}

export function getGenreFixReasons(genreId: GenreId): { word: string; reason: string }[] {
  const profile = genreProfiles[genreId];
  if (!profile) return [];
  return profile.wordRules.slice(0, 3).map(rule => {
    const match = rule.pattern.source.split('|')[0].replace(/\\/g, '');
    return { word: match, reason: rule.tip };
  });
}
