# Google Play reviewer access — EaseVerse

## Text to paste in Play Console

No account is required to review EaseVerse's core functionality.

1. Open EaseVerse and continue past the introduction.
2. Tap the record button. The app explains why microphone access is needed
   before Android displays its permission prompt.
3. Allow microphone access, record a short take and stop it.
4. Open Session Review and play the take.
5. Close and reopen the app, then open Sessions to verify that the local take
   remains available.
6. Open Profile to view the public Privacy Policy and Delete account & data
   pathway.

CreatorHub Workspace, Sound Room and Pro Tools Companion are optional
organisation integrations. They require an existing CreatorHub membership and
Google sign-in, but are not required to access or review the app's local music
workflow. EaseVerse does not require a subscription or payment for the steps
above.

If Google requests access to an organisation-only integration during review,
contact `support@creatorhubn.com`. CREATORHUB AS will provision a dedicated,
non-administrator reviewer membership for the exact review period. Never share
an owner, administrator or employee account with a reviewer.

## Internal provisioning checklist (do not paste secrets)

Only perform this section if Play review explicitly requires the restricted
CreatorHub integration.

1. Create a dedicated Google identity such as `play-review@creatorhubn.com`.
2. Create a normal CreatorHub user row for that email; do not grant a global
   admin role.
3. Add the user as a viewer/editor only to a disposable review workspace and
   Sound Room project containing non-confidential demo audio.
4. Verify Google OAuth, Workspace handoff, Sound Room and sign-out from a clean
   device profile.
5. Place credentials and any MFA bypass/recovery instructions only in Play
   Console's protected App access field, never in Git, chat, screenshots or
   release notes.
6. Rotate/revoke the review credentials and remove project membership after the
   review window.

The backend intentionally rejects a Google account that is not already linked
to an active CreatorHub user. This prevents arbitrary self-registration and is
why a dedicated least-privilege membership must be provisioned before sharing
review access.
