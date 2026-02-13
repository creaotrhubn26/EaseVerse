import { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

export type MoodLevel = 'anxious' | 'scattered' | 'low' | 'neutral' | 'energized' | 'confident';

export interface MoodOption {
  id: MoodLevel;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  color: string;
  description: string;
  suggestion: string;
}

export interface BreathingPattern {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  inhale: number;
  hold: number;
  exhale: number;
  holdAfter: number;
  cycles: number;
  color: string;
  description: string;
  bestFor: string;
}

export interface EnergyTechnique {
  id: string;
  title: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  color: string;
  steps: string[];
  durationSeconds: number;
  bestForMoods: MoodLevel[];
  description: string;
}

export interface Affirmation {
  text: string;
  mood: MoodLevel[];
}

export interface VisualizationExercise {
  id: string;
  title: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  color: string;
  durationSeconds: number;
  narration: string[];
  bestFor: string;
}

export const moodOptions: MoodOption[] = [
  {
    id: 'anxious',
    label: 'Anxious',
    icon: 'thunderstorm',
    color: '#EF4444',
    description: 'Nervous energy, racing thoughts, stage fright',
    suggestion: 'Try a slow breathing exercise to calm your nervous system',
  },
  {
    id: 'scattered',
    label: 'Scattered',
    icon: 'shuffle',
    color: '#F59E0B',
    description: 'Hard to focus, too many thoughts at once',
    suggestion: 'A grounding visualization will help you center your attention',
  },
  {
    id: 'low',
    label: 'Low Energy',
    icon: 'cloudy',
    color: '#6B7280',
    description: 'Tired, unmotivated, feeling flat',
    suggestion: 'An energizing breath pattern will wake up your body and voice',
  },
  {
    id: 'neutral',
    label: 'Neutral',
    icon: 'partly-sunny',
    color: '#8B5CF6',
    description: 'Steady and calm, open to direction',
    suggestion: 'A quick visualization will sharpen your performance focus',
  },
  {
    id: 'energized',
    label: 'Energized',
    icon: 'flash',
    color: '#10B981',
    description: 'Excited, buzzing, ready to go',
    suggestion: 'Channel that energy with a focus technique so it serves your voice',
  },
  {
    id: 'confident',
    label: 'Confident',
    icon: 'sunny',
    color: '#FF7A18',
    description: 'Feeling strong, present, in the zone',
    suggestion: 'Lock in your confidence with a power affirmation and visualize success',
  },
];

export const breathingPatterns: BreathingPattern[] = [
  {
    id: 'box',
    title: 'Box Breathing',
    subtitle: 'Equal rhythm to calm the mind',
    icon: 'square-outline',
    inhale: 4,
    hold: 4,
    exhale: 4,
    holdAfter: 4,
    cycles: 4,
    color: '#3B82F6',
    description: 'Breathe in a steady square pattern. Each phase is the same length, creating balance and calm.',
    bestFor: 'Anxiety, pre-performance nerves',
  },
  {
    id: 'four-seven-eight',
    title: '4-7-8 Relaxation',
    subtitle: 'Deep calm for nervous energy',
    icon: 'moon',
    inhale: 4,
    hold: 7,
    exhale: 8,
    holdAfter: 0,
    cycles: 3,
    color: '#8B5CF6',
    description: 'A long exhale activates your parasympathetic nervous system, melting tension from your throat and body.',
    bestFor: 'Stage fright, tight throat',
  },
  {
    id: 'energize',
    title: 'Power Breath',
    subtitle: 'Quick energy boost',
    icon: 'flash',
    inhale: 2,
    hold: 1,
    exhale: 2,
    holdAfter: 0,
    cycles: 6,
    color: '#10B981',
    description: 'Short, sharp breaths to wake up your diaphragm and energize your body before performing.',
    bestFor: 'Low energy, flat delivery',
  },
  {
    id: 'singer',
    title: 'Singer Breath',
    subtitle: 'Expand your breath support',
    icon: 'mic',
    inhale: 4,
    hold: 2,
    exhale: 8,
    holdAfter: 2,
    cycles: 4,
    color: '#FF7A18',
    description: 'Long controlled exhales build the breath support that powers your singing voice. Focus on keeping airflow steady.',
    bestFor: 'Breath control, sustained notes',
  },
];

export const energyTechniques: EnergyTechnique[] = [
  {
    id: 'ground',
    title: 'Grounding 5-4-3-2-1',
    icon: 'earth',
    color: '#10B981',
    steps: [
      'Notice 5 things you can SEE around you',
      'Touch 4 things you can FEEL (floor, clothing, mic)',
      'Listen for 3 things you can HEAR right now',
      'Identify 2 things you can SMELL',
      'Notice 1 thing you can TASTE',
      'Take a slow breath. You are here. You are ready.',
    ],
    durationSeconds: 90,
    bestForMoods: ['anxious', 'scattered'],
    description: 'Brings you back to the present moment when thoughts are racing',
  },
  {
    id: 'power-pose',
    title: 'Power Stance',
    icon: 'body',
    color: '#FF7A18',
    steps: [
      'Stand with feet shoulder-width apart',
      'Place hands on hips, shoulders back, chin slightly up',
      'Hold this position and breathe deeply for 30 seconds',
      'Feel your body taking up space confidently',
      'Imagine your voice filling the entire room',
      'Release the pose but keep the feeling',
    ],
    durationSeconds: 60,
    bestForMoods: ['low', 'anxious'],
    description: 'Physical posture changes affect how you feel. Stand like a performer.',
  },
  {
    id: 'shake-it-out',
    title: 'Shake It Out',
    icon: 'hand-left',
    color: '#F59E0B',
    steps: [
      'Stand up and shake your hands vigorously for 10 seconds',
      'Shake your arms and shoulders loose',
      'Bounce lightly on your feet, shaking your whole body',
      'Let any tension fall off you like water',
      'Gradually slow down and stand still',
      'Notice how much lighter your body feels',
    ],
    durationSeconds: 45,
    bestForMoods: ['anxious', 'energized', 'scattered'],
    description: 'Physical release of nervous energy so it does not show up in your voice',
  },
  {
    id: 'focus-word',
    title: 'Focus Word',
    icon: 'eye',
    color: '#8B5CF6',
    steps: [
      'Choose one word that describes how you want to perform (e.g., "powerful," "smooth," "free")',
      'Close your eyes and repeat the word silently 5 times',
      'Feel what that word means in your body',
      'Imagine singing with that quality throughout your set',
      'Open your eyes and carry that intention forward',
    ],
    durationSeconds: 60,
    bestForMoods: ['neutral', 'scattered', 'low'],
    description: 'Anchor your intention with a single word that guides your performance',
  },
  {
    id: 'channel-energy',
    title: 'Channel the Fire',
    icon: 'flame',
    color: '#EF4444',
    steps: [
      'Acknowledge the strong energy you feel right now',
      'Place one hand on your chest and feel your heartbeat',
      'Instead of fighting the intensity, welcome it',
      'Imagine directing all that energy into your voice',
      'Visualize it becoming fuel for an unforgettable performance',
      'Say to yourself: "This energy is my superpower"',
    ],
    durationSeconds: 60,
    bestForMoods: ['energized', 'confident'],
    description: 'Turn high energy into performance fuel instead of letting it scatter',
  },
];

export const affirmations: Affirmation[] = [
  { text: 'My voice is unique and it deserves to be heard', mood: ['low', 'anxious'] },
  { text: 'I am prepared and I trust my practice', mood: ['anxious', 'scattered'] },
  { text: 'Every performance makes me stronger', mood: ['low', 'neutral'] },
  { text: 'I release perfection and embrace expression', mood: ['anxious', 'scattered'] },
  { text: 'My emotions make my singing authentic', mood: ['anxious', 'low', 'energized'] },
  { text: 'I am exactly where I need to be right now', mood: ['scattered', 'anxious'] },
  { text: 'The audience wants me to succeed', mood: ['anxious', 'low'] },
  { text: 'I give myself permission to feel and to sing freely', mood: ['neutral', 'low'] },
  { text: 'This energy flowing through me is creative power', mood: ['energized', 'confident'] },
  { text: 'I command this stage with every breath', mood: ['confident', 'energized'] },
  { text: 'My voice is an instrument of joy and connection', mood: ['neutral', 'confident'] },
  { text: 'I transform nervous energy into passionate performance', mood: ['anxious', 'energized'] },
];

export const visualizations: VisualizationExercise[] = [
  {
    id: 'golden-light',
    title: 'Golden Light',
    icon: 'sunny',
    color: '#FF7A18',
    durationSeconds: 90,
    narration: [
      'Close your eyes and take a deep breath',
      'Imagine a warm golden light above your head',
      'With each breath, the light flows down through your body',
      'It relaxes your jaw, opens your throat, warms your chest',
      'The light fills your lungs with easy, full breath',
      'It flows down to your diaphragm, grounding you',
      'Your entire body glows with calm, confident energy',
      'When you open your eyes, you carry this light into your performance',
    ],
    bestFor: 'Pre-performance calm and confidence',
  },
  {
    id: 'perfect-take',
    title: 'The Perfect Take',
    icon: 'videocam',
    color: '#3B82F6',
    durationSeconds: 120,
    narration: [
      'Close your eyes and picture yourself stepping up to perform',
      'See the space around you clearly — the lights, the mic, the energy',
      'Feel your feet grounded firmly on the floor',
      'You take a breath and the first note comes out perfectly',
      'Each phrase flows naturally, your voice strong and free',
      'You feel the emotion of every word you sing',
      'The audience is with you, hanging on every note',
      'You finish the song and feel the satisfaction of a great performance',
      'Open your eyes. That performance lives inside you. Go create it.',
    ],
    bestFor: 'Building performance confidence',
  },
  {
    id: 'safe-space',
    title: 'Your Safe Space',
    icon: 'shield-checkmark',
    color: '#10B981',
    durationSeconds: 90,
    narration: [
      'Close your eyes and imagine a place where you feel completely safe',
      'It could be a room, a garden, a stage — anywhere that feels like home',
      'Notice the details: colors, temperature, sounds',
      'In this space, no one judges you. You can sing freely',
      'Let your body relax completely in this safe environment',
      'Practice a phrase or melody in your mind here',
      'Feel how free your voice sounds without fear',
      'Carry this feeling of safety with you when you open your eyes',
    ],
    bestFor: 'Overcoming performance anxiety',
  },
];

export function getRecommendedBreathing(mood: MoodLevel): BreathingPattern {
  switch (mood) {
    case 'anxious':
      return breathingPatterns.find(b => b.id === 'four-seven-eight')!;
    case 'scattered':
      return breathingPatterns.find(b => b.id === 'box')!;
    case 'low':
      return breathingPatterns.find(b => b.id === 'energize')!;
    case 'neutral':
    case 'confident':
      return breathingPatterns.find(b => b.id === 'singer')!;
    case 'energized':
      return breathingPatterns.find(b => b.id === 'box')!;
    default:
      return breathingPatterns[0];
  }
}

export function getRecommendedTechniques(mood: MoodLevel): EnergyTechnique[] {
  return energyTechniques.filter(t => t.bestForMoods.includes(mood));
}

export function getAffirmationsForMood(mood: MoodLevel): Affirmation[] {
  return affirmations.filter(a => a.mood.includes(mood));
}

export function getRecommendedVisualization(mood: MoodLevel): VisualizationExercise {
  switch (mood) {
    case 'anxious':
      return visualizations.find(v => v.id === 'safe-space')!;
    case 'low':
    case 'neutral':
      return visualizations.find(v => v.id === 'golden-light')!;
    case 'confident':
    case 'energized':
      return visualizations.find(v => v.id === 'perfect-take')!;
    case 'scattered':
      return visualizations.find(v => v.id === 'golden-light')!;
    default:
      return visualizations[0];
  }
}
