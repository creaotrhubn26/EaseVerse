# EaseVerse / Sound Room: implementation and local QA

Date: 2026-10-17. Status: implemented locally; remote E2E acceptance pending.

This work changes the actual Expo app and both applications' API routes. It does not publish the CreatorHub landing page or change production data.

## Implemented

- Native booth: lyrics, feedback and takes tabs; one persistent audio player; timestamp seek; real repeated sections; clear selection of reference mix or vocal take; accessible controls and restored cold-start project/song links.
- Imagegen-created navigation icons with visible labels. Source prompts/hashes are in `assets/images/ux-icons-v1/provenance.json`.
- Authorized booth snapshots use a canonical linked project and authenticated membership. The approved private reference is resolved before a first take exists. Older unlinked takes remain owner/member-scoped and readable.
- Current Sound Room producer comments are fetched in a batch, associated with the exact uploaded object, and shown with timecodes/regions. Resolved/rejected comments are excluded. Feedback refresh preserves unexpired reference URLs and the active player.
- New takes, producer memos and comp exports use private CreatorHub S3 upload tickets, SHA-256 checksums and single/multipart uploads. The server binds the owner, actor, linked room and track; keys never enter the mobile app. Quota belongs to the existing project's owner storage account.
- Memo and comp uploads retain their parent identity and do not create extra Sound Room mix candidates. New memo/comp playback requires project membership. Existing B2 audio remains readable.
- Completed vocal takes create a Sound Room review version and artifact lineage. Selecting a keeper reuses that verified version. Manual take imports skip the already-published S3 takes.
- Corrected native M4A/browser codec MIME types, duplicate content-type headers, double-slash API URLs, and the legacy keeper query's nonexistent `created_at` field.

## Verification completed

- EaseVerse TypeScript check: passed (`npx tsc --noEmit`).
- EaseVerse transport/context/regression tests: 20 passed (4 test files).
- CreatorHub backend regression tests: 32 passed (6 test files).
- Backend bridge/storage modules bundle with esbuild.
- Native Release simulator build succeeded for iPhone 17 Pro, iOS 26.5.
- Actual native app UI tested against the read-only local fixture at port 5238: cold start into Nordlys, lyrics/feedback/takes navigation, 12-second audio loading/playback, timestamp jump to 0:08, repeat of 0:04–0:12 across multiple cycles, tab changes during playback, and source switching.
- Feedback wording: “Hold den tonen. Hold pausen før neste linje.”

The transport tests use controlled requests/storage responses. The simulator uses local audio and synthetic project data. These checks are not evidence of a real cloud upload or live two-account synchronization.

## Remaining remote acceptance

1. Publish the corresponding backend and EaseVerse API changes together to an agreed test environment, without publishing landing-page changes.
2. Authenticate the producer and vocalist as real test accounts in a linked test project. Verify project membership/invitation separately from the Sound Room `easeverse_access` toggle; this work does not claim those two membership stores are synchronized.
3. Upload a native M4A and a multipart WAV to real CreatorHub S3. Download/compare bytes and check the actual key hierarchy, checksum, quota, storage policy, account separation and retry behavior.
4. Add/edit/resolve a producer comment in Sound Room and observe it on the vocalist's device. Test during playback and after backgrounding/reopening.
5. Select Keeper, pull takes twice, share a memo and export a comp. Confirm no duplicate review versions and no public access to the new audio.
6. Check microphone capture and live-session recording on a real device. Simulator playback alone does not establish microphone, hardware latency or production OAuth behavior.

## Boundaries

- No production/staging deployment or real user-data mutation was performed for these changes.
- No landing-page merge/publication or further EaseVerse film composition was performed.
- Older unlinked reference-upload functionality remains a legacy path; the linked-project UI uses the Sound Room reference instead. This is not a claim that every historical EaseVerse storage path has been migrated.
