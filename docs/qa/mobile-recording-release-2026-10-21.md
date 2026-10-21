# EaseVerse mobile recording release QA — 21 October 2026

Apple accepted processing of 1.0.0 (33), delivery 3c7d1448-d4fd-47bd-b694-67c55936c9d6. Its source was 0108fc9, before the follow-up fixes below. It is internally available, not submitted to public App Review. The tester confirmed opening it on a physical iPhone and that recording works. Other physical-device behavior is not yet certified.

## Follow-up fixes

- Session Review's three narrow statistic cards broke status words mid-word on iPhone. Responsive labelled rows preserve complete words. Three browser cases check every word's bounds at 320, 390 and 768 px and keyboard operation of the tips disclosure. The date row wraps naturally.
- The microphone rationale now scrolls on short/large-text screens and its full-width permission button has padding, a minimum touch height and dark text against orange.
- Generic genre coaching is labelled as general practice tips, explicitly separate from assessment of this recording, and collapsed by default.
- Native recordings previously stayed in purgeable ExpoAudio cache and stored absolute iOS sandbox paths. An app reinstall relocated the container, making an existing 19-second take unavailable. Native startup now rebases known document/cache paths and copies recovered recordings into Documents/easeverse-recordings. New recordings are preserved there when stopped. Missing files remain unavailable; failed copies retain the source and retry later. No audio is uploaded by migration.
- The existing test take was recovered after reinstall in the Release simulator and playback reached 0:18/0:18. Its 280,561-byte durable copy was verified locally. Six unit cases cover sandbox relocation, document relocation, full disk, missing files, traversal/remote URLs and Android paths.
- Patch-compatible proxy-addr and shell-quote updates remove the two critical findings identified by npm audit. Other dependency findings require separate assessment; this is not a claim of a clean dependency audit.

## Integration and release limits

CreatorHub backend PR #2871 is merged as 8294af12495f597f21210a8ea6779f55db17dc89. Live checks confirmed wrong-account lookup 404, invited-recipient lookup 200, and unchanged-profile save 200 without changing role/access. Native email routing remains disabled until the app rollout.

Android preview APK versionCode 5 built from 0108fc9 is installed in a fresh, isolated API 36 emulator. The pre-existing emulator app was preserved when its store signing key differed from the preview key. Maestro 2.11.0 is explicitly authorized for Android QA. The emulator has audio I/O disabled, so it cannot certify audible playback or physical microphone quality. A Google Play-delivered build and pre-launch report are separate gates.

Production /api/v1/session-score currently returns 404. The old Express-only implementation is not deployed as a Netlify route. The production Netlify app also lacks a transcription-provider key. Generic text-derived heuristics do not establish phonetic pronunciation or musical timing. This must not be marketed as validated vocal assessment. Public-store submission remains held for native E2E, reviewer access, privacy/deletion requirements and store declarations.
