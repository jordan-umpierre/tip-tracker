# Launch prep

## What this session was for (2026-08-07)

One question, asked right after the audit in phase 30: what is actually
stopping this from reaching the App Store, and what is the smallest next step?

The answer turned out to be "nothing technical — no build has ever existed."
But checking that claim properly surfaced three real defects, one of which
would have shipped.

## What was already done

The first recommendation was to set the three `EXPO_PUBLIC_` values in the EAS
`preview` environment. They were already there. `eas env:list --environment
preview` returned all three, and a byte comparison against the local `.env`
matched on all three. Advice given, advice already taken.

Worth checking rather than assuming the values were also *correct*, so the
endpoint they name got a request:

```
GET /health   → 200  {"status":"ok"}
GET /v1/me    → 401  {"error":"unauthorized"}
```

That is the first time the deployed API has been reached since phase 29, and
the first confirmation that the URL bundled into a build would work.

## `172b6b7` — fix: give the app a human display name and wire every build profile to an environment

Two problems, one commit, because the second is invisible without the first.

`expo.name` was `tip-tracker`. That string is the label under the home screen
icon and the default App Store name. It has been that way since phase 14, when
the scaffold was moved out of its throwaway directory and `name` was set to
match the slug — correct as a fix for the throwaway name, never revisited as
branding. It now reads `Tip Tracker`. The slug is untouched: it identifies the
EAS project and moving it would break the link.

The `production` profile in `eas.json` named no environment. `preview` gained
one in `d181736`; `production` and `development` never did. A production build
would therefore have resolved none of the three values.

## The failure mode that made the second half urgent

The obvious assumption is that a build with no configuration fails loudly.
It does not, and this was checked rather than reasoned about:

```
loadAuthSetup({})                              → {config: null, error: null}
loadAuthSetup({EXPO_PUBLIC_API_URL: "..."})    → {config: null, error: "...invalid."}
```

All three absent is a *supported state*, not an error. It is D25's signed-out
local-only mode, and returning `null` there is right — a user who never makes
an account should not see a configuration error.

The consequence for a build is the trap. A `production` build with an empty
environment compiles, passes review, and ships with sign-in and sync silently
absent. Nothing in the app says anything is wrong; it just quietly has no cloud
features. Only a *partial* configuration throws.

Naming the environment in `eas.json` does not populate it, so this is still
reachable. It is written into `NEXT` as the thing to check on the built app
rather than infer from the config.

## `7e57e6b` — fix: stop claiming iPad support the layouts have never been tested on

`ios.supportsTablet` was `true`. Apple reviews on iPad when an app claims it,
and requires iPad screenshots to submit.

Everything in this app was built and device-verified on phones. The calendar
grid from phase 15, the income chart's touch scrubbing from phase 13, and the
swipe-to-reveal shift rows have never rendered on a tablet, and there is no
iPad in this project's testing history to check them against.

Set to `false`. This is not a decision that iPad support is unwanted — it is a
refusal to claim a form factor with no evidence behind it. Turn it back on when
there is an iPad pass to support it.

## Production deferred on purpose

The `production` and `development` EAS environments are both still empty, and
that is the decision, not an omission.

The current Supabase project and Lambda are staging. The Resend sender is
`onboarding@resend.dev`, which only delivers to the address on the Resend
account, so password recovery reaches the owner and nobody else. Promoting that
to production would ship a recovery flow that silently fails for every real
user.

Filling production is a decision about infrastructure — same project or a
separate one, with its own migration run, its own deploy, and a verified
sending domain — and it should be made after a preview build has run on a
device, not while the app has never executed.

## Verification

`expo config --type public` resolves to `name: "Tip Tracker"`,
`ios.supportsTablet: false`, with the slug, bundle identifier, owner, and EAS
project id unchanged. Expo Doctor 20/20, `tsc --noEmit` clean, iOS export
succeeds, and the full repository hook passed on both commits.

## What this does not do

No build was produced. `eas build` logs into Apple, generates a distribution
certificate and a provisioning profile, and prompts through it — that is
interactive and was not run from this session. Everything here makes the build
correct when it happens; none of it is evidence that it has.
