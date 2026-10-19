# Native Sound Room invitations

The canonical app invitation is `https://easeverse.netlify.app/sound-room/invite/<token>`. The native screen uses React Native controls, the system photo library, existing CreatorHub authentication and the real private server bridge. The same route works in a browser when the app is absent, with an explicit `easeverse://` button as a fallback.

A recipient must sign in with the email stored on the Sound Room invitation. CreatorHub resolves the actor's email in its own user table, checks invitation expiry/revocation and archived project state, and saves only profile fields. Role, invited email and EaseVerse access are controlled by the producer. No agreement is signed and no fee or payment is created. The private key remains server-side.

Project membership is linked only after explicit profile submission, only to the existing owner/room/track association, and only when the producer enabled EaseVerse access. Existing memberships and roles are retained; retries cannot create duplicates or grant producer privileges. A failed synchronization stays an error and can be retried safely.

## Coordinated rollout

1. Deploy the CreatorHub private bridge and keep `EASEVERSE_NATIVE_INVITES_ENABLED` off. Existing email links continue to work.
2. Publish the EaseVerse API/web route and the AASA file. Verify `/.well-known/apple-app-site-association` returns HTTP 200, JSON and no redirects from the production host.
3. Build a new signed app containing the invitation route and associated-domain entitlement. An older installed app cannot gain these capabilities through a backend-only release.
4. Verify warm/cold invocation, sign-in return and profile persistence on a physical iPhone. Existing Apple team ID is taken from eas.json (`9TAUZCPK95`), bundle ID `com.easeverse.app`. Paths are restricted to `/sound-room/invite/*`.
5. Android manifest is prepared, but publish `assetlinks.json` only after verifying the SHA-256 fingerprint against the actual Google Play app-signing certificate. A debug/upload certificate is not sufficient proof of the Play distribution identity. Do not fabricate a fingerprint.
6. Enable `EASEVERSE_NATIVE_INVITES_ENABLED=true` after the web fallback and released apps are ready. Then new invitation email uses the app-associated HTTPS link and the old CreatorHub invitation page can offer the native route.

No new CreatorHub database migration is required. Native first-run, current account, offline errors and image-picker behavior must be tested before a store release. Do not claim simulator custom-scheme tests prove production Universal/App Link verification.
