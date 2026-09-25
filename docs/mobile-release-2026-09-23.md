# EaseVerse mobile test release — 23 September 2026

## Change

Remove app-triggered haptics from Lyrics, including saves, tabs, genre selection,
section editing, import, snapshots, focus mode, tempo input and pencil controls.
The iOS configuration also includes the photo-library purpose string required
by Apple's binary validation for a linked native library.

- Lyrics source commit: `bd3c30d`
- iOS metadata correction: `050b75b`
- Base: `166946b` (latest `origin/main` when this release was prepared)
- Pull request: https://github.com/creaotrhubn26/EaseVerse/pull/43
- Verification: TypeScript and all 53 unit tests passed; `git diff --check` passed.
- Physical-device haptic behavior was not tested during this release.

## iOS / TestFlight

- Bundle: `com.easeverse.app`
- Version: `1.0.0 (32)`
- Release archive and export succeeded; the final archive contains the required
  photo-library usage description and the production API URL.
- IPA SHA-256: `8685e6ede2e8b2b1de8a2426ccb4ca6c2f91f88e690d7140d4fb38fe517d14eb`
- Delivery/build UUID: `5f6a55fc-10ed-4598-bbc5-33f28da7e7df`
- Upload succeeded; Apple upload state is `COMPLETE`, build state is `VALID`,
  and internal testing state is `READY_FOR_BETA_TESTING`.
- Build 32 is listed in the existing `Creatorhub_EaseVerse` internal group.
- Test notes are saved in English (`en-US`) and Norwegian (`no`).
- The internal group currently contains zero testers. No new testers were
  invited. The external group has no assigned builds and was not changed.
- Build 31 was rejected for a missing `NSPhotoLibraryUsageDescription`;
  build 32 contains the correction and passed Apple's processing.

## Android / Google Play internal testing

- Package: `com.easeverse.app`
- Version: `1.0.0`, version code `4`
- EAS build: `7ccfdb38-5367-491a-a80e-92a4c07b2b49`
- Build: https://expo.dev/accounts/creatorhubn/projects/easeverse/builds/7ccfdb38-5367-491a-a80e-92a4c07b2b49
- AAB SHA-256: `72734473acbe83d3a5baf79d0a7e64be6f1424a4bf6f6eea5138b86b5b46501c`
- `bundletool` 1.18.3 validation passed; JAR signature verified; package,
  version code, target SDK 36 and production API URL verified from the bundle.
- Release name: `EaseVerse 1.0.0 (4) - Lyrics without haptics`
- Published on 23 September 2026 at 09:42 CEST to the existing internal track.
- Google Play status: `Active`, latest release is version code 4, and
  `Available to internal testers`.
- Tester opt-in: https://play.google.com/apps/internaltest/4701344165098069914
- Google reported only the existing non-blocking missing-deobfuscation-file
  warning; there were no blocking errors or lost supported devices.

Neither app was promoted to a public production store release.
