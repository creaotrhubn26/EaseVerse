# EaseVerse booth review — 18 October 2026

Status: local implementation and browser acceptance completed. Native Release build and installation completed; fresh native UI acceptance and live Sound Room acceptance remain pending. No deployment or real project mutation.

## Changes in this review

- `lib/booth-refresh.ts`: serialized authenticated polling with a 15-second deadline, request cancellation, automatic retry and immediate foreground refresh. Disposed/background requests cannot overwrite a new room.
- `app/booth/[trackId].tsx`: wait for auth restoration, reset context when song/project/account changes, preserve the player during temporary failures, clear private content on access errors, and expose a selected tab/source to web assistive technology. Polling uses the existing server stream's five-second cadence with native bearer/cookie support.
- `components/UniversalAudioPlayer.tsx`: replay from the beginning at end of audio; explicit retry on playback-resolution errors; web keyboard seeking and correct accessible position values.
- `tests/booth-refresh.test.ts`: six tests for concurrency, stale response suppression, foreground refresh, recovery, timeout and lifecycle cleanup.

## Evidence

- 21 targeted transport, membership, snapshot, upload and refresh tests passed. Storage requests are controlled tests; they do not establish a real S3 upload.
- TypeScript passed. Scoped ESLint passed with zero errors and existing warnings (including unused legacy waveform controls and hook-dependency warnings).
- iOS Simulator Release build succeeded and was installed on EaseVerse iPhone Review. Native UI automation remained unable to read/click the simulator after switching between the iPad and iPhone windows. No native-interaction success is claimed for this build.
- Real Expo web bundle tested through the browser tool at 390 × 844 against a read-only localhost fixture. Lyrics, Feedback, Takes, reference/vocal source switching and real 12-second local WAV playback worked.
- A new producer-note timecode appeared during repeated 0:04–0:12 playback without resetting the player.
- Deliberate HTTP 503 on refresh preserved lyrics/audio. Removing the failure automatically cleared the notice and resumed updates. A timecode link jumped to 0:10.
- End then Play restarted from 0:00. Home then ArrowRight moved the paused position to 0:05. Selected tabs and exact slider values were verified in the rendered accessibility tree.

QA output: `outputs/easeverse-booth-review-20261018/` in the parent CreatorHub checkout. Browser artifacts are not native-device screenshots. The fixture listener is bound only to 127.0.0.1:5238, and POST is disabled.

## Required before claiming live end-to-end completion

Publish the existing paired EaseVerse/CreatorHub bridge changes to an agreed test environment, authenticate an authorized artist and producer in the same linked test project, and verify real S3 upload/download plus add/edit/resolve feedback during playback and after background/resume. A real device is required for microphone and hardware behavior. The prior 2026-10-17 report retains the full acceptance checklist.
