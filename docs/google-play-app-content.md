# Google Play App content — EaseVerse

This is the reviewed submission worksheet for production package
`com.easeverse.app`, version `1.0.0` (`versionCode` 3). Recheck the exact Play
Console wording before submitting because Google can change the questionnaire.

## Privacy policy and account deletion

- Privacy policy URL: `https://easeverse.netlify.app/privacy`
- Account deletion URL: `https://easeverse.netlify.app/account-deletion`
- Data controller: CREATORHUB AS, organisation number 937 518 684
- Support/privacy contact: `support@creatorhubn.com`

Both URLs are public and available without authentication. The same pages are
linked from Profile inside the app.

## Ads

- **Does the app contain ads?** No.

The release dependency and source audit found no advertising SDK and the app
does not render paid or house ads.

## App access

- **Are all or some features restricted?** Core review does not require an
  account. Recording, playback, local persistence, songs, lyrics, practice,
  privacy information and the deletion pathway are available without login.
- CreatorHub cloud projects and collaboration are optional organisation
  features and use the shared CreatorHub Google sign-in.
- Do not submit an administrator's Google credentials in Play Console.
- Paste the reviewer instructions from `docs/google-play-reviewer-access.md`.

## Target audience and content

- Intended age groups: **13–15, 16–17 and 18+**.
- The app is not designed primarily for children and must not be presented as a
  child-directed product.
- Store category: **Music & Audio**.
- The app does not contain gambling, simulated gambling, dating, uncontrolled
  web browsing or purchases of age-restricted goods.

## Content rating preparation

Use these current-build facts when answering IARC. Do not guess the resulting
rating; let the questionnaire calculate it.

- Violence, fear, sexual content, profanity supplied by the app, drugs,
  gambling and crude humour: **No**.
- User-generated content: **Yes**. Signed-in collaborators can share lyrics,
  recordings, comments and project material inside access-controlled projects.
- Online interaction/communication: **Yes**, in access-controlled CreatorHub
  collaboration features.
- Users can block arbitrary public users: **Not applicable**; there is no public
  user discovery or open stranger chat in EaseVerse.
- Users can report inappropriate project content: handled through
  `support@creatorhubn.com` and the project owner. Recheck whether the Play form
  requires an in-product reporting control before production rollout of UGC.
- Location sharing: **No**.
- Digital purchases in the Android app: **No** in this release.

## Data Safety answers

The table describes data that can leave the device in the production build.
"Optional" means the user can use the local core without that cloud feature.
Service providers acting only on CREATORHUB AS's instructions are processors,
not independent advertising recipients. Confirm every production provider and
retention rule immediately before submission.

| Play data type | Collected | Shared | Required/optional | Main purpose | Handling |
|---|---|---|---|---|---|
| Name | Yes, after sign-in | No | Optional | Account management, app functionality | Linked to account |
| Email address | Yes, after sign-in | No | Optional | Account management, security | Linked to account |
| User IDs | Yes, after sign-in | No | Optional | Account and project access | Linked to account |
| Photos (profile image URL/image) | Possible after Google sign-in | No | Optional | Profile display | Linked to account |
| Audio files / voice recordings | Yes, only for selected analysis, sync or sharing | No | Optional and user-initiated | App functionality, personalisation | Linked to account or pseudonymous device ID; not ephemeral when intentionally shared |
| Files and documents (lyrics/project material) | Yes for cloud/sync features | No | Optional | App functionality, collaboration | Linked to account/project |
| App interactions | Yes for coaching/synchronisation events | No | Optional | App functionality, personalisation | Account-linked or pseudonymous |
| Other user-generated content (comments, transcripts, takes) | Yes for cloud/collaboration | No | Optional | Collaboration and app functionality | Linked to account/project |
| Crash logs | No dedicated crash-reporting SDK found | No | — | — | Recheck backend/hosting logs before submission |
| Diagnostics | Basic server request/error details may be processed | No | Optional when network features are used | Security, reliability | Retained only as operationally required |
| Device or other IDs | A pseudonymous device identifier may be used for coaching history | No | Optional | App functionality, personalisation | Pseudonymous |

Global declarations:

- Data is encrypted in transit: **Yes** for production network traffic.
- Users can request deletion: **Yes**, in-app and at the public deletion URL.
- The app follows Google's Families policy: **Not applicable as a
  child-directed app**, while normal youth-safety obligations still apply.
- Data is sold: **No**.
- Data is shared for advertising: **No**.

## Final owner checks before pressing Submit

1. Confirm the production build has no newly added analytics, advertising or
   crash-reporting SDK.
2. Confirm the privacy policy names every active processor used by the enabled
   production paths.
3. Confirm the account-deletion mailbox is monitored and requests are tracked.
4. Confirm project UGC has an adequate reporting/escalation path for the chosen
   IARC and target-audience answers.
5. Save an export or screenshot of the submitted Data Safety answers with the
   release record.

## Google references

- App content: <https://support.google.com/googleplay/android-developer/answer/9859455?hl=en>
- Data Safety: <https://support.google.com/googleplay/android-developer/answer/10787469?hl=en>
- Target audience: <https://support.google.com/googleplay/android-developer/answer/9867159?hl=en>
- App access: <https://support.google.com/googleplay/android-developer/answer/15191715?hl=en>
