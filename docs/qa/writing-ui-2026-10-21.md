# EaseVerse writing and preparation UI — 21 October 2026

The Sing empty state is now a scrollable page instead of an opaque layer over recording controls. Capture prepares a local voice memo; recording still requires an explicit Record action. Existing song selection, lyrics, warmup and mindfulness routes are preserved. Optional practice setup starts collapsed and can be operated by keyboard.

Lyrics keeps the song title visible on mobile. Settings, library and genre controls scroll with the page. Four equal mobile tabs fit 320 CSS pixels, expose selection, and support arrow/Home/End navigation on web. An untouched draft is labelled New draft. Writer tools use named disclosures. Native exports open the system share sheet; web retains copying, TXT download and printing.

Autosave only runs for changed drafts. Clearing an existing song's lyrics persists, and a local save does not reset the insertion position for the same song. Native warmup links preserve one validated project ID on cold and warm launches.

## Evidence

- TypeScript and scoped ESLint checks passed.
- 90 unit tests passed, including cold/warm native link cases.
- `e2e/writing-start.spec.ts`: four local browser tests passed at 320, 390, 768 and 1440 pixels. They cover optional setup by keyboard, title entry, stable autosave, tabs, version saving and clearing/reopening lyrics. API responses in this suite are isolated fixtures; this is not proof of authenticated Sound Room integration.
- Additional browser interaction checks passed at the same widths: song picker, warmup/focus/lyrics navigation, memo preparation, settings and rehearsal in Sing.
- Canonical Xcode Release simulator build passed. Native visual inspection confirmed the new Sing page, Lyrics layout and Writer disclosures. A synthetic song was entered in the native editor, saved and retained across app termination and reinstall. Signed production app distribution is not part of this check.
- Generated illustrations were reviewed for unwanted lettering, logos and private content. Final assets and exact prompts are recorded in `assets/images/writing-art-provenance.json`. No generated UI is used as a functional control.

## Release limits

The authenticated producer-booking-to-artist-completion test is tracked separately. A successful local UI/storage check does not certify that service integration, nor does installing the simulator build publish an App Store release.
