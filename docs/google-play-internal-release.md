# Google Play internal release runbook — EaseVerse 1.0.0

## Verified artifact

- Package: `com.easeverse.app`
- Version: `1.0.0`
- Version code: `3`
- Target SDK: `36`
- AAB EAS build: `c75a5a17-ddb2-4b48-b0c5-96cbd8745e06`
- SHA-256: `2e7c44bed25a8325810b2ade35219869ea44482f14d6111808f3ebe44f9c602a`
- Artifact URL:
  `https://expo.dev/artifacts/eas/2CYrrxjKGklBUuYT3IIxw0f0uBiLfuyJYX9hMOrv8Go.aab`
- Validation: `bundletool` 1.18.3 `validate` passed.

## Release name

`EaseVerse 1.0.0 (3) - internal verification`

## Release notes (en-US)

Initial Android test release with local vocal recording and playback, songs and
lyrics, practice tools, session persistence, and optional CreatorHub Workspace,
Sound Room and Pro Tools Companion handoff.

## Release notes (nb-NO)

Første Android-testversjon med lokalt vokalopptak og avspilling, låter og
sangtekster, øvingsverktøy, lagrede økter og valgfri kobling til CreatorHub
Workspace, Sound Room og Pro Tools Companion.

## Internal-track publication — 14 September 2026

- Google developer identity verification: approved.
- Play Console app ID: `4972870716164733237`.
- Internal-testing track ID: `4701344165098069914`.
- Tester list: `Creatorhub AS` (controlled list, two configured users).
- Release state: active and available to internal testers.
- Opt-in URL:
  `https://play.google.com/apps/internaltest/4701344165098069914`
- The active CreatorHub Google account accepted the invitation and reached the
  package install page.
- Play accepted the artifact with one non-blocking missing-deobfuscation-file
  warning and no bundle error.

The API 36 Google Play emulator is now signed in with the enrolled tester
account, and the browser opt-in page confirms tester status. The Play listing
still returned `Item not found` during the initial release propagation window.
After the Play Store cache was reset, Google displayed its Terms of Service;
the account owner must accept those terms directly before the next install
attempt. Then install through the opt-in URL and run the acceptance checklist
below. Do not promote the artifact if any item fails or if Play replaces the
uploaded artifact/version code.

## Store setup completed on 14 September 2026

- English store description, icon, feature graphic and two real phone
  screenshots uploaded.
- Category saved as **Music & Audio**.
- Public contact details published with the CreatorHub support address and the
  EaseVerse website.
- Privacy-policy URL verified publicly over HTTP 200 and saved for review.
- No-ads declaration saved after the release dependency/source audit.
- Play Console's outstanding App content count decreased from 11 to 9.

These prepared changes have not been sent for review. Content rating, target
audience, Data Safety and other legally binding declarations still require the
account owner's final check.

## Installed-Play-build acceptance

- First launch and intro render without a red error screen.
- Microphone permission appears only after a recording action.
- Record at least 20 seconds; stop; open Session Review; playback advances.
- Force-stop and cold-start; the take remains in Sessions and plays.
- Privacy and account-deletion pages open without login.
- CreatorHub sign-in opens the system browser/Google chooser and returns to the
  app without a 403.
- Authenticated state remains after a cold restart; sign-out clears it.
- A Workspace deep link opens the expected EaseVerse integration/project
  context without exposing a bearer token in the URL.
- No fatal Android, React Native or authentication errors appear in logcat.
- Play pre-launch report has no blocking crash, security or accessibility issue.

## Promotion gate

Production promotion remains blocked until:

- App content and Data Safety have owner sign-off;
- the internal Play-installed build passes the acceptance checklist;
- any required reviewer-only CreatorHub membership has been tested and scoped;
- the current privacy/deletion URLs return HTTP 200 publicly.

Future `eas submit` automation also requires a least-privilege Google Play
service-account JSON to be configured securely in EAS. No Play submission
service account was attached when version code 3 was published manually.

Google release reference:
<https://support.google.com/googleplay/android-developer/answer/9859348?hl=en>
