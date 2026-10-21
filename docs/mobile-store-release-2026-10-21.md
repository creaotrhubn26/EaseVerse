# EaseVerse mobile store release candidate — 21 October 2026

Status: preparing and verifying; neither store has a public release.

## Candidate

- Combined mobile UI/warmup work and native Sound Room invitation routes.
- Producer-issued project memberships unlock the artist tabs without granting prototype, producer or administrator status. Banned accounts remain blocked. Later invitations reconcile for existing users; accepting and consuming local pending invitations is atomic.
- Account-access service failures show a retry screen instead of silently bypassing approval.
- Optional cloud practice analysis is off by default. Profile explains recordings, lyrics/history and OpenAI transcription before opt-in. Local recording/playback still work; unavailable analysis is not shown as a measured zero or a pronunciation/timing assessment.
- iOS build number: 33. Android uses the EAS production-android app-bundle profile and a separate installable android-preview APK for native QA.
- Android App Links use the actual Play App Signing certificate published in Play Console on 21 October: D8:71:80:A4:83:17:87:75:A6:E7:EC:9D:55:0E:88:1F:79:B4:F8:99:05:F5:1B:C2:CE:DE:62:A0:6A:22:AD:EB. Source: Play Console → EaseVerse → Protected with Play → Manage Play app signing → Digital Asset Links JSON. No debug/upload certificate is substituted.
- EAS uploads exclude outputs/ and other local QA artifacts; no private browser/account state belongs in build inputs.

## Store inventory (verified, not published)

Apple app 6780806167 / com.easeverse.app is PREPARE_FOR_SUBMISSION, version 1.0. Latest processed TestFlight build is 1.0.0 (32), uploaded 23 September. The current native changes are absent from it.

Google Play app 4972870716164733237 / com.easeverse.app has internal version code 4, released 23 September. Production is inactive. Dashboard shows 4 of 11 setup tasks complete: App access, content rating, target audience, Data Safety, government, financial and health declarations still need completion and final owner review.

The production CreatorHub server currently returns 404 Endpoint not implemented for /api/integrations/easeverse/invitations/lookup and /complete; the studio-overview route correctly requires its private service key (401 without one). A tested backend route release is required before claiming live native invitation E2E.

## Validation and acceptance

Unit/type/lint and isolated browser checks are recorded under outputs/mobile-store-release-20261021/. Fixtures prove client behavior and handler boundaries; they do not prove Play/App Store delivery, production database behavior, physical-device Universal/App Links or real audio quality. Native iOS and Android UI, microphone denial/acceptance, recording/playback, restart persistence, invitation ownership/expiry, account return and profile synchronization remain required on the actual candidate artifacts. Store screenshots must show the released UI and no private account or customer data.

Do not claim public availability from a successful upload. Apple and Google review/processing and final store statuses must be verified separately. Legal agreements and legally binding declarations require the owner at their final acceptance step.
