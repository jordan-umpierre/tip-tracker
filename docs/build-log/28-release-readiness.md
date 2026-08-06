# Release readiness

## What this session was for (2026-08-06)

Everything here answers one question: what stands between a finished feature
set and a build a stranger can install? The money math, the tax math, the
overtime math, the local database, and the sync halves were all done. None of
that is the same as shippable.

The work split into three kinds. Things that block a store submission outright,
things a reviewer would fail the project on, and defects the last session
already knew about and left open.

## Blockers

`87727ee` added [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).
Until then the only place these checks ran was one laptop, which nobody else
can verify. The workflow does not restate the check list: it installs
dependencies, supplies the PostgreSQL server and the `sqlite3` binary a laptop
already has, and runs `.githooks/pre-commit` itself. Anything added to the hook
is picked up here for free.

One detail is load-bearing. `test-schema.sh`, `test-migration.sh`, and
`test-backup-restore.sh` all skip themselves with a `WARN` when `sqlite3` is
missing, which is right on a laptop and wrong in CI: the run would go green
having tested nothing. So the workflow runs `sqlite3 --version` first and fails
there instead.

`4c5dc91` added [`eas.json`](../../eas.json) and the two identifiers that did
not exist: `ios.bundleIdentifier` and `android.package`, both
`com.jordanumpierre.tiptracker`. Neither store target could be built before
this. Versioning is `remote`, so EAS owns `buildNumber` and `versionCode`. No
update channels, because `expo-updates` is not installed and a channel with no
update client is decoration. No `env` block, because the three
`EXPO_PUBLIC_` values differ per environment and belong in EAS environment
variables rather than a tracked file.

`3ae6b57` added in-app cloud account deletion. App Store guideline 5.1.1(v)
requires it of any app that offers account creation, and this app has offered
account creation since D25 with no way to undo it. The `DELETE /v1/me` route
had existed since `8451e78`; nothing called it.

Two things in that unit are worth more than the button. First, the flow asks
for the password again, because the server refuses a deletion whose token
carries no password authentication from the preceding five minutes, and a
session restored from the Keychain days ago carries none. Re-signing in mints a
token that satisfies the rule and doubles as proof of who is holding the phone.

Second, deleting now releases the local account binding. Without that, the
SQLite database still named an account the server had tombstoned, so every
later sign-in would hit the mismatch guard in `bindAccount` and the device
could never use cloud sync again — a permanent consequence of an action
described to the user as removing only the cloud copy. `releaseSyncAccount`
clears the binding, the pull cursor, and every server version, then rebuilds
the outbox from the rows themselves the way `4-to-5.sql` did. The rebuilt
entries take new local sequences, because `sync_outbox.local_sequence` is
`AUTOINCREMENT` and a reused sequence would collide with an idempotency key the
server already recorded for this device.

`02ba072` added password recovery. Sign-in and sign-up existed; a user who
forgot their password was locked out permanently. Recovery sends a six-digit
code, verifies it, and sets the new password through the session that
verification creates.

The choice there was code versus emailed link. A link has to return to the app
as a deep link, which means a provider redirect allowlist plus universal-link
and app-link setup on both platforms, and a session exchanged out of a URL. The
code path needs none of it and is entirely in-app. Its one cost is a
provider-side setting — the recovery email template has to include the token —
now written down in [`server/README.md`](../../server/README.md) beside the
password-length setting the client's own validation assumes.

`2351614` added [`privacy-policy.md`](../privacy-policy.md) and
[`store-disclosures.md`](../store-disclosures.md). Both stores require a public
policy URL before a build can be submitted. The policy is written from the code
rather than from a template, which is why it can state that the withholding
estimator's taxable-wage input and its result are never stored anywhere, and
which fields the request log deliberately leaves out. The disclosures file
holds the App Privacy and Data safety answers with the reasoning for each,
because those forms get filled in months later from memory and an answer
contradicting the policy is a rejection.

## What a reviewer would have failed

`74b4540` fixed the withholding screen's tax-year limit. The shipped tables
cover 2026 and the pay date defaults to today, so on 2027-01-01 every estimate
would fail — but only after the user filled in a pay date and their taxable
wages. The section now says so up front and disables the button, while saving
W-4 settings keeps working, because those rows are effective-dated and outlive
any one year's tables.

The year had been written as a literal in four places across two files and the
screen. It now lives in one exported `SUPPORTED_TAX_YEAR` that the validator,
the disclosure text, the headings, and a new shared pay-date rule all read.
The same commit removed an alert branch that re-read `"Only tax year 2026"` out
of a thrown error: the handler's own guard returns before the calculator can
ever raise it, so that branch was unreachable.

`3cba32a` removed the web target and recorded it as D27. Web had been broken at
runtime since sync landed — a fresh SQLite bootstrap reaches
`expo-file-system`, which a browser does not support. Four separate filesystem
call sites would need a browser story, for a platform the README has never
listed as a target. A target that compiles and then crashes reads as
"supported" to anyone who has not tried it. Both native bundles still export
without `react-dom` or `react-native-web`, which is the evidence they were
web-only.

`17c8585` took the four Expo SDK 57 patch updates that had drifted, putting
Expo Doctor back to 20/20.

`a970a81` bounded request volume. The API had a body-size ceiling and no
request ceiling, so a public endpoint could be flooded for free. Every route
past `/health` and `/ready` now shares a fixed 600-per-minute window per client
address, answered with `429` and `Retry-After`.

Two decisions inside that. The budget is sized for D26's serialized push, where
a first upload of a long shift history is hundreds of legitimate sequential
requests from one address — a tighter limit would break the exact case the sync
design produces. And `TRUST_PROXY_HOPS` is new and required in any deployment
behind a load balancer: left at zero, every request appears to come from the
balancer and one bucket throttles everybody; set higher than the real number, a
client can forge `X-Forwarded-For` and pick its own bucket. It is stated per
deployment rather than inferred.

The counter lives in this process's memory, which is correct for one instance
and wrong for two. That ceiling is marked in the source with its upgrade path.

`9ef14df` added one structured log line per finished request: method, path,
status, duration, and the account subject once a token has verified. `/health`
proves the process is alive; it does not tell you what the API did. Nothing
that could carry a token or a user's earnings is logged — no bodies, no query
strings, no headers — and an unmatched path is a stranger's string, so it is
truncated rather than written at whatever length they chose. A passing probe
writes nothing, or polling every few seconds forever buries real traffic under
lines that only say what silence already says.

## The three findings D26 left open

`4f0a061` closed all three.

The catch around a sync run set `blocked` for every unexpected error, so a
database that failed to open told the user a record needed review. Unknown
failures now report as `failed`.

Supabase hands out a new session object on every hourly `TOKEN_REFRESHED`
event. Reading the session straight out of state made `syncNow` a new function
each time, which re-ran the effect and started a sync nobody asked for. The
token is read from a ref and the effect is keyed on the account id, so the
triggers stay the three D26 lists.

`applySyncResult` moved above its caller, so the provider reads top to bottom
again.

The same commit made blocked records legible. They were a bare "review needed";
they are now named on screen with one resolution — discard this device's change
and take the account's copy. `discardBlockedMutation` drops the outbox row and
its remembered server version, then rewinds the pull cursor so the next pull
delivers the record's current server state. Rewinding the whole cursor to fetch
one record is a marked shortcut: the targeted alternative needs an endpoint
that does not exist, and this runs once per conflict a person resolved by hand.

Keeping the local version instead is still not offered, because it needs the
rebase semantics D26 deliberately left unspecified. The user can make the edit
again, which is a fresh mutation against a version they can now see.

## Self-review

`b9d0e66` acted on a Fallow audit of the session's own diff: one type exported
with no consumer, one duplicated timeout guard in `accountApi.ts`, and an
`AccountPanel` that had grown to 423 lines while the repo layout says
`components/` holds focused pieces of screen UI. Sign in, recovery, sync
status, and deletion each moved into `components/account/`, and the panel kept
what it was always for — which state is showing. It is 134 lines now.

`AuthProvider` is the one Fallow finding left standing, at 547 lines. It is
deliberate for now: splitting a stateful provider is the kind of change whose
bugs only appear on a device, and no device pass has happened yet. It is named
in the roadmap as the next cleanup rather than done blind at the end of a long
session.

## What none of this proves

Every result here is static: TypeScript, the repository hook, real temporary
PostgreSQL, real SQLite, and iOS/Android exports. No Supabase project exists,
no API is deployed, no recovery email has been sent, no account has been
deleted against a real provider, and no screen added this session has been seen
on a phone.
