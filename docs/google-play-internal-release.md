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

`EaseVerse 1.0.0 (3) — internal verification`

## Release notes (en-US)

Initial Android test release with local vocal recording and playback, songs and
lyrics, practice tools, session persistence, and optional CreatorHub Workspace,
Sound Room and Pro Tools Companion handoff.

## Release notes (nb-NO)

Første Android-testversjon med lokalt vokalopptak og avspilling, låter og
sangtekster, øvingsverktøy, lagrede økter og valgfri kobling til CreatorHub
Workspace, Sound Room og Pro Tools Companion.

## Console sequence after organisation approval

1. Create the app in Play Console with default language English (United States),
   app type App, free pricing and package `com.easeverse.app`.
2. Complete every item in App content using
   `docs/google-play-app-content.md` and paste the reviewer text from
   `docs/google-play-reviewer-access.md`.
3. Upload the icon, feature graphic and at least the two committed phone
   screenshots from `store-assets/google-play/`.
4. Create an Internal testing release and upload the verified AAB above.
5. Add only controlled internal testers and publish to the internal track.
6. Install through the Play opt-in link on a clean Android device/profile.
7. Run the acceptance checklist below. Do not promote the artifact if any item
   fails or if Play replaces the uploaded artifact/version code.

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

- Google organisation/developer verification is approved;
- App content and Data Safety have owner sign-off;
- the internal Play-installed build passes the acceptance checklist;
- any required reviewer-only CreatorHub membership has been tested and scoped;
- the current privacy/deletion URLs return HTTP 200 publicly.

Google release reference:
<https://support.google.com/googleplay/android-developer/answer/9859348?hl=en>
