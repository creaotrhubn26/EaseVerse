# Invited artists and bands — clarified access model

Producer invitations are the entry to shared EaseVerse projects for artists and band members. They must not require a separate Workspace subscription, prototype application or shared band login. Each member needs a personal identity and project-scoped invitation. A future “invite whole band” action must retain individual delivery/activation results, permit selective resend/revocation, and never mark a whole band active merely because one person joined.

## Current change

The Profile secondary action is now “Invited by your producer?” instead of “Create account”. Its screen directs recipients to the personal invitation email and explains individual band profiles. The generic CreatorHub-front-page link was removed. Sign-in identifies EaseVerse and the actual Google method rather than implying that the recipient must already use Workspace. No invitation, email, entitlement or production account is created by this copy/navigation change.

## Remaining integration work — not claimed complete

- PR #52 / branch feat/native-sound-room-invitations contains the native invitation screen and verified private invitation bridge. It is not present in the current warmup/Profile branch and has not been merged as part of this UI correction.
- The current generic AppGate still blocks app_users with pending status. Producer-invited access must be proven server-side from a valid per-user invitation/membership and treated separately from prototype approval. Banned users must remain blocked; no blanket exemption for all pending users or promotion to producer/admin is appropriate.
- Existing users/me applies local pending email invites only on first appearance. Already registered invitees also need reliable membership reconciliation.
- The project invite screen still has legacy single-member copy; whole-band selection, per-recipient outcomes and real delivery need coordinated implementation with Sound Room's invitation route.
- Verify invitation ownership, invited email, expiry, revocation, repeat acceptance, wrong-account handling and two independent members joining the same producer project. Neither person may inherit the other's profile or access an unrelated project.

These are release blockers for claiming the complete invitation-based band onboarding flow. The UI clarification does not resolve them or publish access changes.
