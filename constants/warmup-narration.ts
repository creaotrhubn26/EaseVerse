/** Fixed, user-approved Fal voice. No runtime generation or silent voice fallback. */
export const warmupVoice = {
  provider: "fal.ai",
  voice: "Algenib",
  language: "nb-NO",
} as const;
export const warmupNarration: Record<
  string,
  { title: string; transcript: string }
> = {
  "body-stretch": {
    title: "Slipp spenningene",
    transcript:
      "Rull skuldrene rolig bakover og framover. Beveg hodet forsiktig fra side til side, innenfor det som kjennes behagelig. La kjeven være myk, og rist lett løs i hender og armer. Stopp hvis noe gjør vondt.",
  },
  "diaphragm-breathing": {
    title: "Rolig pust",
    transcript:
      "Stå eller sitt behagelig, og senk skuldrene. Pust rolig inn gjennom nesen. La pusten få plass uten å presse. Pust deretter jevnt ut med en myk s-lyd. Ta en vanlig pust mellom rundene, og unngå å holde pusten hvis det føles ubehagelig.",
  },
  humming: {
    title: "Myk nynning",
    transcript:
      "Lukk leppene lett, og nynn en myk m-lyd på en tone som kjennes behagelig. La kjeven være avslappet. Beveg tonen forsiktig litt opp og ned, uten å presse volum eller tonehøyde. Ta pauser når du trenger det.",
  },
  "lip-trills": {
    title: "Leppevibrasjon",
    transcript:
      "La leppene være løse, og blås forsiktig luft gjennom dem så de vibrerer. Legg eventuelt til en myk tone i et behagelig leie. Hvis vibrasjonen stopper, ta en pause og prøv med mindre trykk. Ikke press for å få det til.",
  },
  sirens: {
    title: "Rolig toneglidning",
    transcript:
      "Lag en myk o-lyd på en behagelig tone. Gli rolig litt oppover, og tilbake ned igjen. Hold deg innenfor et område som kjennes lett. Det er ingen konkurranse om å nå høye toner. Ta en pause hvis stemmen føles anstrengt.",
  },
  "yawn-sigh": {
    title: "Gjesp og sukk",
    transcript:
      "La kjeven falle mykt ned, som ved et lite gjesp. Pust så rolig ut på et lett sukk med en myk a-lyd. La tonen synke naturlig. Hold bevegelsen liten og avslappet, uten å presse eller trekke inn ekstra mye luft.",
  },
  "vowel-scales": {
    title: "Myke vokaler",
    transcript:
      "Velg en behagelig tone, og syng vokalene a, e, i, o og u med lavt volum. La kjeven være myk når du bytter vokal. Prøv deretter en kort bevegelse opp og ned i tonehøyde. Hold deg der stemmen kjennes lett.",
  },
  "tongue-twisters": {
    title: "Tydelig uttale",
    transcript:
      "Begynn med å si: Tre trøtte troll. Si ordene langsomt og tydelig, med avslappet kjeve og tunge. Gjenta noen ganger før du eventuelt øker tempoet litt. Tydelighet er viktigere enn fart. Ta en pause hvis du merker spenning.",
  },
};
