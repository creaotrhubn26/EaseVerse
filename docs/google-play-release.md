# EaseVerse Google Play release

This is the operational release record for `com.easeverse.app`. It is a code-audit-based draft and must be reviewed by the account owner before the Play declarations are submitted.

## Release identity

- App name: EaseVerse
- Developer: CREATORHUB AS
- Organisation number: 937 518 684
- D-U-N-S number: 348432540
- Category: Music & Audio
- Package: `com.easeverse.app`
- Android target: API 36
- Minimum Android version: API 24 (Android 7.0)
- Support email: `support@creatorhubn.com`
- Privacy policy: `https://easeverse.netlify.app/privacy`
- Account deletion: `https://easeverse.netlify.app/account-deletion`

The D-U-N-S number was submitted for Google Play organisation verification on 11 September 2026. Google approval is pending. The Norwegian organisation number and D-U-N-S number are separate identifiers.

## Current release candidate

- Preview APK: EAS build 2 (`3fc160b7-19c0-4729-bf0e-d71ac298404e`), SHA-256 `d50198a3b34662964d63da9c32bdbe60fdeb4a3505107e0efcb01544a8824b10`.
- Production AAB: EAS build 3 (`c75a5a17-ddb2-4b48-b0c5-96cbd8745e06`), SHA-256 `2e7c44bed25a8325810b2ade35219869ea44482f14d6111808f3ebe44f9c602a`.
- Package: `com.easeverse.app`; version `1.0.0`; production `versionCode` 3.
- The AAB passed `bundletool` 1.18.3 validation and targets Android API 36.

### Release-device verification — 11 September 2026

The exact EAS preview APK was installed into an ephemeral API 36 Play Store emulator session so the existing local test profile remained untouched.

- First launch and the in-app microphone rationale rendered correctly.
- Android microphone permission was requested only after the user started recording and was granted successfully.
- A real 26-second microphone take reached Session Review and played back with an advancing waveform.
- The recording remained in Sessions after a force-stop and cold app restart.
- The shared CreatorHub sign-in opened the real Google account chooser for `creatorhubn.com` and returned to EaseVerse successfully.
- The authenticated CreatorHub identity remained available after another force-stop and restart.
- No authentication 403, fatal Android exception or React Native runtime error was observed.

## Store listing draft

Prepared assets are versioned in `store-assets/google-play/`:

- `feature-graphic-1024x500.png`: Play feature graphic, exactly 1024×500.
- `app-icon-512.png`: Play listing icon, exactly 512×512 and 174 KB.
- `01-workspace-companion-1080x2160.png`: real Android screen showing the Workspace/Pro Tools Companion setup.
- `02-recording-ready-1080x2160.png`: real Android recording screen, exactly 2:1.
- `listing-en-US.md`: reviewed English store copy.
- `listing-nb-NO.md`: reviewed Norwegian Bokmål store copy.

The screenshots come from the release APK on the API 36 emulator. They have not been composited or given simulated UI. The feature graphic was generated from the committed EaseVerse app icon with the built-in image-generation workflow and then resized without changing its content.

### Short description

Record, practise and review vocals with lyrics, coaching and CreatorHub projects.

### Full description

EaseVerse is a focused music workspace for vocalists, songwriters and producers.

Capture ideas and vocal takes, organise songs and lyrics, practise difficult sections and review performance insights in one calm workflow. Core recording and session history work locally on your device. Sign in with your CreatorHub account when you want to connect projects across CreatorHub Workspace, Sound Room and Pro Tools Companion.

Key features:

- Record vocal sessions and play them back
- Write and organise songs and lyrics
- Practise sections with guided tools
- Review session timing and coaching insights
- Open the correct CreatorHub Workspace or Sound Room project
- Continue a production handoff from Pro Tools Companion
- Use the core local workflow without creating an account

Microphone access is requested only when you start a recording, live session or voice-analysis feature.

## App access for review

The local recording, playback, songs, lyrics and session workflow can be reviewed without an account. CreatorHub cloud and collaboration features require the shared CreatorHub Google sign-in flow. Add a dedicated, non-privileged reviewer account in Play Console before production review; do not put passwords in this repository.

Reviewer path:

1. Launch EaseVerse and skip or finish the intro.
2. Allow microphone access when starting a recording.
3. Record and stop a short take, then open Session Review and play it back.
4. Open Profile for the privacy policy, deletion pathway and CreatorHub sign-in.
5. Use the supplied review account only for Workspace/Sound Room integration checks.

## Android permissions

Release builds intentionally use:

- `RECORD_AUDIO`: user-started recording, live transcription and voice analysis.
- `MODIFY_AUDIO_SETTINGS`: recording and playback routing.
- `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK`: reliable media playback.
- `INTERNET` and network state from runtime libraries: sign-in, cloud projects, uploads and analysis.
- `VIBRATE`: interface feedback and media behavior.

Location, camera, biometric, system-overlay and legacy external-storage permissions are explicitly blocked. Debug-only overlay permission is not present in the release manifest.

## Data Safety draft

Answer these declarations from the behavior of the production backend and all enabled integrations, not from this document alone.

Data that can be collected when the user chooses account, cloud, collaboration or analysis features:

- Personal information: name, email address, CreatorHub user ID and optional profile image.
- User content: recordings/audio files, lyrics, transcripts, project metadata, takes and comments.
- App activity: practice/coaching events, timing and performance measurements, feature interactions tied to an account or pseudonymous device ID.
- Diagnostics and security: IP address, timestamps, request/error details and abuse-prevention data.

Purposes:

- App functionality and account management
- CreatorHub project synchronisation and collaboration
- Personalised coaching and history
- Security, fraud prevention and reliability

Operational statements to verify before submission:

- Data is encrypted in transit.
- Core local functionality is available without an account.
- Users can request deletion in the app and at the public deletion URL.
- Temporary analysis conversion files are removed after processing.
- Uploaded/shared content remains until it or the associated account is deleted, subject to limited legal or security retention.

Do not declare that voice/audio stays only on the device: audio selected for scoring, analysis, synchronisation or sharing is sent to the EaseVerse service.

## Required Play Console work

1. Wait for Google to approve the submitted developer identity and organisation verification.
2. Create the app with package `com.easeverse.app`, default language English and app type App.
3. Complete App content: privacy policy, data safety, ads, target audience, content rating and app access.
4. Upload the feature graphic, app icon and at least two representative phone screenshots.
5. Create an internal-testing release with the signed AAB and add internal testers.
6. Run the exact installed Play build through recording, playback, persistence, OAuth handoff and privacy/deletion checks.
7. Promote only after pre-launch reports, policy checks and reviewer access pass.

Prepared console worksheets and runbooks:

- `docs/google-play-app-content.md`
- `docs/google-play-reviewer-access.md`
- `docs/google-play-internal-release.md`

## Build and submit

```bash
npx eas-cli@24.0.0 build --platform android --profile production-android
npx eas-cli@24.0.0 submit --platform android --profile production-android
```

The first Android submission requires the app to exist in Play Console and a Google Play service-account JSON to be configured securely in EAS. OAuth client-secret JSON is not a Play submission credential.
