import type { GenreId } from '@/lib/types';

const genreLyrics: Record<GenreId, { title: string; lyrics: string }> = {
  pop: {
    title: 'Midnight Glow',
    lyrics: `Walking through the city lights tonight
Every shadow tells a story bright
I can feel the rhythm in my bones
Dancing on these cobblestones alone

The midnight glow is calling me
A melody that sets me free
I sing it loud I sing it clear
For everyone around to hear

Stars are painting lines across the sky
Whispered promises that never die
Hold my hand and follow me along
Every step becomes our favorite song`,
  },
  jazz: {
    title: 'Blue Smoke Lounge',
    lyrics: `Moonlight drips through smoky glass tonight
Piano keys are whispering just right
I lean into the rhythm slow and low
Let the bass line tell me where to go

The blue smoke curls around my voice
A lazy swing that leaves no choice
I scat along the midnight air
Doo ba dee without a care

Glasses clink and shadows softly sway
The music takes the hours away
I close my eyes and feel the groove
Nothing left for me to prove`,
  },
  rnb: {
    title: 'Silk and Honey',
    lyrics: `Your touch is velvet on my skin tonight
The way you move me baby feels so right
I melt into the melody we make
Every whisper every breath we take

Silk and honey dripping from your lips
The way your body sways against my hips
I feel the falsetto rising in my chest
Of all the loves I know you are the best

Run the notes like water down my spine
Every single syllable divine
Hold me close and never let me go
Love is all we ever need to know`,
  },
  rock: {
    title: 'Thunderstrike',
    lyrics: `Fire burning in my veins tonight
I was born to shake this stage alight
The drums are pounding louder than my heart
I was built to tear this world apart

Thunderstrike across the sky we break
The ground is shaking in our wake
We scream it out with everything we got
Give it all and never ever stop

Raise your fist and feel the power rise
Lightning cracking through the midnight skies
We are the storm we are the flame
Nothing is ever gonna be the same`,
  },
  classical: {
    title: 'Garden of Eternity',
    lyrics: `Beneath the silver moon I softly sing
Of gardens where the nightingales take wing
Each note ascends like petals in the breeze
A gentle prayer that drifts among the trees

The morning dew adorns the roses fair
A tender light is floating through the air
My voice shall carry forth across the vale
A timeless song that never shall grow pale

In halls of marble echoes sweetly ring
Where hearts in purest harmony do sing
Let every breath sustain this sacred art
As music binds the soul unto the heart`,
  },
  hiphop: {
    title: 'Concrete Dreams',
    lyrics: `Step to the mic check the rhythm and flow
City lights flashing putting on a show
From the block to the top watch the money grow
Every bar hits hard let the whole world know

Concrete dreams built from nothing at all
Started from the bottom now I stand tall
System tried to break me but I never fall
Listen to the beat hear my people call

Rhymes hit heavy like a midnight train
Hustle through the struggle push beyond the pain
Every word I spit is running through your brain
Remember my name when I rise to fame`,
  },
  country: {
    title: 'Dusty Road Home',
    lyrics: `Down a dusty road the sun is going down
Fireflies are dancing all around my town
I can hear the river singing soft and slow
This is where my heart will always want to go

Dusty road just take me home tonight
Porch light shining warm and bright
Guitar strings humming our old song
This is where I have always belonged

Boots on gravel stars above my head
Thinking about the words you said
Love is simple when the world is still
Just a country heart and a windowsill`,
  },
  soul: {
    title: 'River of Grace',
    lyrics: `Deep inside my soul a river starts to flow
Carrying the pain and joy of long ago
Every note I sing is rising from the ground
A gospel cry that makes a healing sound

River of grace wash over me tonight
Take my broken voice and make it right
From a whisper low to a mighty shout
This is what my living is all about

Feel the swell of power in my chest
Every single word puts my heart to test
I will sing until the morning light
My soul will burn forever bold and bright`,
  },
};

export function getGenreDemoLyrics(genreId: GenreId): { title: string; lyrics: string } {
  return genreLyrics[genreId] || genreLyrics.pop;
}
