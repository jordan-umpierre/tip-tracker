# Store privacy answers

The answers to fill into Apple's App Privacy questionnaire and Google's Data
safety form, and why each one is what it is.

This file exists because those two forms are filled in from memory months
after the code was written, and an answer that contradicts
[privacy-policy.md](privacy-policy.md) or the code is a rejection. Change the
code, change this file, then change the store listing.

Both forms must be answered for the **whole app as shipped**, including the
optional cloud account, not for the local-only path.

## Apple — App Privacy

| Data type | Collected | Linked to user | Tracking | Purpose |
|---|---|---|---|---|
| Email address | Yes | Yes | No | App functionality (sign in) |
| Other user content (jobs, shifts, withholding settings) | Yes | Yes | No | App functionality (cloud backup and sync) |
| Device ID | Yes | Yes | No | App functionality (duplicate-safe sync) |
| Crash data, performance data, analytics | No | — | — | No SDK collects any |
| Financial info (payment) | No | — | — | The app takes no payments |
| Location, contacts, photos, health, browsing | No | — | — | Never requested |

"Tracking" is **No** everywhere: nothing is combined with third-party data or
used for advertising, so no App Tracking Transparency prompt applies.

The shift and tip records are **user content**, not "financial info" — Apple's
financial category is payment and credit information, which this app never
touches.

Answering "not collected" for everything is only correct for a build with no
cloud account. This app has one, so the questionnaire has to say so even
though most users may never sign in.

## Google Play — Data safety

| Question | Answer |
|---|---|
| Does the app collect or share user data? | Yes |
| Is data encrypted in transit? | Yes (HTTPS) |
| Can users request data deletion? | Yes — in-app, Manage data → Cloud account → Delete cloud account |
| Data collected | Email address; app activity / other user-generated content; device or other IDs |
| Data shared with third parties | None. Supabase and the API host are service providers processing on our behalf, which Google does not count as sharing |
| Is any collection optional? | Yes — all of it. The app is fully usable with no account |
| Data used for advertising or marketing | No |

## Required links

- **Privacy policy URL**: the published copy of
  [privacy-policy.md](privacy-policy.md). Both stores need a public URL that
  resolves without a login.
- **Account deletion URL** (Google's Data deletion requirement): the same
  policy page, whose "Deleting your data" section names the in-app path.
  Google accepts an in-app path documented on a public page.
- **Support contact**: the address at the bottom of the policy.

## What would change these answers

- Adding crash reporting or analytics of any kind. That flips two Apple rows
  and adds a Play category, and it is the most likely future change.
- Storing the withholding estimator's taxable-wage input or its result. Today
  neither is written anywhere, which is why no "financial info" row exists.
- Any paid feature, which introduces purchase data.
