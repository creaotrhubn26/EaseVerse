# EaseVerse Profile UI — 21 October 2026

## Implemented

Profile follows the charcoal/amber design used by Sing, Lyrics and Sessions. A small decorative studio-controls image was generated with the built-in OpenAI imagegen tool, optimized into `assets/images/profile-studio-controls-amber-v1.jpg`, and reviewed for lettering, logos and private content. Exact prompt and usage are saved in `assets/images/profile-art-provenance.json`. It is not a generated avatar or an interactive control.

The opening page now presents account state, genuinely local song/recording statistics and named disclosures for Voice & language, Recording & timing, Studio & lyrics, Practice suggestions, Help & privacy, and signed-in usage tools. Every setting has a visible text label. Language and accent use explicit choice dialogs with current selection and Cancel instead of cycling on every tap. Count-in and voice options retain readable labels. Technical details are secondary; outdated model/capacity claims and the generic average “Score” were removed. Help text was updated to match the actual start page, Sessions filters and new Profile groups.

Signed-out copy no longer promises automatic session syncing. Account identity uses actual account data and its avatar, with an initial fallback. Local songs and takes remain separate from shared projects. Usage has a retry action and clears stale data on account changes. Failed sign-out retains the visible account with a retryable error instead of clearing local auth before the server confirms. Existing studio, companion, lyric sync, privacy and deletion-information routes remain available. No account deletion or real profile update is performed by these checks.

Practice suggestions load on request and show an unavailable/error state; they no longer silently render empty counters as if a request succeeded. This is UI error handling, not a fix for the separately known unavailable learning endpoints.

## Evidence

- TypeScript, scoped ESLint, diff whitespace checks and Expo web asset budget pass.
- 92 unit tests pass.
- Six Profile browser tests cover 320, 390, 768 and 1440 CSS pixels; disclosure by keyboard, selected option semantics, cancel focus return, language/accent/voice/count-in/tracking setting persistence across reload, unavailable suggestions, privacy and sign-in navigation, long synthetic identity, usage failure/retry, failed sign-out/retry, and retention of a local synthetic song after sign-out.
- The combined smoke selection covers 25 Playwright cases across Profile, Sessions, writing, shared auth boundaries, PWA and the local Lyrics → Sync → Sing → Review → Practice Loop workflow. All Profile checks use isolated identities/API fixtures. They are not proof of live two-account Sound Room integration.
- An intermittent seek failure in the synthetic Sessions audio fixture was traced to ignoring Chromium byte-range requests. The fixture now responds with actual byte ranges and HTTP 206, matching seekable audio delivery. Three repeated playback cases pass after that correction.
- Canonical Xcode Release simulator build succeeds and is installed without erasing app data. Native visual inspection covers Profile overview, the Voice & language disclosure and choice dialog. A temporary French practice-language selection survived termination/reinstall and was restored to English. The synthetic local song remains intact. Native account state remains signed out; real Google login/sign-out was not exercised.
- Visual evidence is saved under `outputs/warmup-fal-20261020/profile-*`: overview and expanded recording settings at four widths, stressed account at 320 pixels, and final native screenshot. Narrow and wide screenshots were reviewed. No horizontal overflow was observed in the tested Profile states.

## Verdict and release limits

APPROVE WITH KNOWN ISSUES for Profile UI. No remaining Profile visual blocker was observed. The existing global tablet/desktop navigation places enlarged icons and labels very close together; it is outside this component. The local recording workflow still reports a missing ffmpeg-static binary and attempts fallback, so passing that UI path does not certify transcription quality. The authenticated live Sound Room completion gate remains open. Production UI, TestFlight and App Store publication are not included.
