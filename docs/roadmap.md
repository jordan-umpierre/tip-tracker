# Roadmap

Where this project is, what's next, and everything done so far in order.
This is the file to open first, every session.

Last updated: 2026-08-10

---

## NEXT

**The staging backend exists and answers. A real Supabase project holds the
migrated schema, and the API is deployed to AWS Lambda behind an API Gateway
HTTP API in `us-west-2` (D28). `/health` returns 200 and `/v1/me` returns 401
unauthenticated. Everything above that is unchanged: release readiness is
implemented and statically verified, both store targets can be built, the
checks run on GitHub rather than one laptop, account deletion and password
recovery work from inside the app, the privacy disclosures exist, and web is
gone (D27). The first build exists and runs on a real device.**

**The iOS `preview` build was made and installed on 2026-08-07. The first thing
ever verified on hardware passed: log a shift, force-quit, relaunch, and the
shift is still there. That is local SQLite persistence, the floor the rest of
the app stands on.**

**Do this next: work through
[`docs/acceptance.md`](acceptance.md) top to bottom.** It is the tracked
checklist for everything that can only be proven on a device, in dependency
order, with the cold-start item already marked passed. Record failures in the
file rather than in your head. Nothing about production is decidable until that
pass is done, and no second person should install a build until its section 7
is clear.

The build command that produced this is below, and everything it needs was
verified the same day: `eas init` is done (`1a97318`), the `preview` profile
names its environment (`d181736`), and that environment holds all three
`EXPO_PUBLIC_` values, byte-matching the local `.env`. The endpoint they point
at is live — `/health` answered 200 and `/v1/me` answered 401 from this laptop.
The Apple membership is active.

```sh
eas build --platform ios --profile preview
```

A Google Play account ($25, one time) is still outstanding, so Android can be
built for internal distribution but not submitted.

**The `development` and `production` EAS environments are deliberately empty,
and that fails quietly.** `readAuthConfig` in [`src/auth/config.ts`](../src/auth/config.ts)
returns `null` with no error when all three values are absent — that is D25's
signed-out local-only state, and it is correct for a user who never makes an
account. It is a trap for a build: a `production` build with an empty
environment compiles, passes review, and ships with sign-in and sync silently
missing. Only a *partial* config throws. So when production is filled, fill all
three at once, and confirm on the built app that Manage data offers an account
rather than assuming the build was configured.

Production is deferred on purpose. The current backend is staging — the Resend
sender only reaches the owner's mailbox — so promoting it as-is would ship
broken password recovery. Decide production infrastructure after preview has
passed on a device, not before.

Two store-facing defects were fixed the same day and are worth not
reintroducing. `expo.name` was `tip-tracker`, which is what the home screen
icon would have read (`172b6b7`). `ios.supportsTablet` was `true` while no
layout had ever rendered on a tablet, which is a rejection risk and a demand
for iPad screenshots (`7e57e6b`).

Still required before submission, and none of it doable from a terminal:
a hosted privacy-policy URL — [`docs/privacy-policy.md`](privacy-policy.md) is
written but lives only in this repo — App Store Connect listing metadata,
screenshots from a real device, and an app name that is actually available.

Three provider settings are still unverified, and none of them can be read with
the keys the server holds — they need a Management API token, so they are eyes
on the dashboard or a failure caught during acceptance. All three are listed in
[`server/README.md`](../server/README.md): the recovery email template must
include `{{ .Token }}`, the minimum password length must be at most 8, and the
email OTP length must be exactly 6.

Two limits are known and not yet fixed. The rate limiter counts in one
process's memory, and Lambda runs concurrent environments that share none, so
it now bounds each instance rather than each caller; that is the one real
regression D28 introduced and it must be closed before anyone who is not the
owner installs a build. The AWS account is also capped at 10 concurrent
executions until AWS raises it. `TRUST_PROXY_HOPS` is set to 1, which is a
reading of how the adapter forwards the caller address rather than a measured
fact — the request log records no client address to check it against.

The native acceptance pass that follows has more to cover than it did before:
auth, push/pull, interruption, offline relaunch, and cross-device convergence,
plus every screen added on 2026-08-06 — account deletion including its
`503 identity_deletion_pending` path, password recovery end to end with a real
email, the blocked-record list and its discard action, and the withholding
screen's out-of-year notice. VoiceOver and TalkBack remain a separate
unverified gate over all of it.

Two things are deliberately left undone and should not be mistaken for
oversights:

1. `AuthProvider` is 547 lines, the largest function in the repo. Splitting a
   stateful provider is the kind of change whose bugs appear on a device, and
   no device pass has happened yet. Split it after native acceptance, not
   before.

   It is not the only Fallow finding, which is what this said until the
   2026-08-07 audit corrected it. `fallow health` names four refactoring
   targets — `LogShiftForm.tsx`, `transport.ts`'s `runSync`,
   `FederalWithholdingForm.tsx`, and `server/test/http.ts` — and 52
   above-threshold complexity functions. What *is* clean, and is the claim
   worth making, is `fallow dead-code` and `fallow dupes`: no dead files, no
   dead exports, no duplication, and every one of the 46 complexity
   suppressions now carries a machine-readable reason. The health findings are
   triage signals against tested branches, not defects.
2. The account connection effect still re-verifies `/v1/me` on every new
   session, including hourly token refreshes. That is a security check
   re-running, not the D26 finding, which was about sync; it was left alone
   rather than weakened. Revisit only if the brief `connecting` state it paints
   turns out to be visible on a real device.

The staging SMTP sender is a test address and cannot reach a real user. Editing
the recovery template at all requires custom SMTP, so the provider is wired to
Resend on its shared `onboarding@resend.dev` sender, which only delivers to the
address on the Resend account that owns the key. That is enough to prove the
six-digit recovery flow against the owner's own mailbox and nothing more: every
other recipient is rejected outright, so a tester who is not the owner sees a
recovery that silently never arrives. Verify a real domain in Resend and change
the sender before anyone else installs a build.

Conflict resolution is half-built on purpose. A blocked record can be named and
discarded in favor of the account's copy; keeping the local version instead
needs the rebase semantics D26 declined to invent. Decide those rules against
real conflicts from real devices, not in advance.

`bc8e170` recorded D22. Email/password verification and reset belong to the
managed auth provider, with custom SMTP required for reliable delivery. Cloud
account deletion cascades cloud rows but preserves local SQLite unless the user
separately erases the device. Conflicts use server versions and a server change
sequence; tombstones travel through sync; equal-looking shifts are never merged
without a shared source id. Provider plan, region, retention, budget, SMTP, and
deployment choices remain explicit gates.

`314537e` added the isolated TypeScript/Express package and wired its narrow
verification into the repository hook. `/health`, strict configuration, a
32-KB JSON boundary, bounded public errors, and graceful process shutdown pass
three built-in Node assertions without adding a test framework or HTTP client.

`ee9891a` added the private `app` schema for accounts and account-owned jobs,
shifts, and federal withholding settings. Composite foreign keys prevent
cross-account children; server versions, one change sequence, timestamps, and
tombstones preserve the future sync facts. A real temporary PostgreSQL database
proves migration rollback, constraints, same-looking shift preservation,
version/sequence updates, tenant ownership, and account cascade deletion.

`8451e78` added remote-JWKS token verification plus the account lifecycle.
The remediation series `2023f23` through `9926627` then closed the review
blockers: durable deletion tombstones, recent-password proof, Supabase identity
deletion with retry semantics, canonical UUID subjects, lossless local text IDs
and `HH:MM` times, checksum-tracked transactional migrations, schema-aware
readiness, and bounded HTTP failure coverage. Seven server tests use real
temporary PostgreSQL databases where persistence matters. The full repository
hook passes and Fallow reports no server health finding without a suppression.

`402988d` recorded D23. `d68c2e1` then added schema version 5: trigger-owned
dirty-row tracking, monotonic local sequences, per-row server metadata, one
canonical account binding, a server pull cursor, and an exclusive remote-apply
transaction that cannot re-enqueue pulled rows. The 4-to-5 migration enqueues
all existing active, archived, and tombstoned domain rows; a fresh database
starts empty. Federal settings now retain tombstones, and backup version 3
preserves them while strict version-1/schema-3 and version-2/schema-4 files
remain restorable. `28057dd` keeps Expo and server TypeScript checks isolated by
their actual package boundary.

Real SQLite assertions cover direct-SQL capture, repeated-edit compaction,
in-flight acknowledgements, migration bootstrap and rollback, restore rollback,
parent-first remote apply, pull rollback and suppression, dirty-row conflict
protection, and account mismatch rejection. This is local plumbing only; no
automated result is evidence of a real provider, network retry, conflict UI, or
native migration of the developer's existing database.

`7629f05` recorded D24. `3dce9d6` added predeployment server migration 002:
separate client timestamps, account/device/operation replay storage, and
account/change-sequence indexes. `1bc12a9` corrected replay scope before any
endpoint shipped so two installations may both use local sequence one.
`eafcc45` added the strict one-mutation route with optimistic server versions,
exact replayed successes/conflicts, retained tombstones, and no guessed
deduplication. `38256bd` added the strict paged pull route over all three entity
tables. Real temporary PostgreSQL plus local JWKS tests cover tenant isolation,
all entity records, duplicate-looking shifts, archives, tombstones, stale and
unique conflicts, replay misuse, invalid input, payload ceilings, transaction
rollback, pagination, cursor order, and account spoofing. Eleven server tests,
the full repository hook, and the server Fallow health/duplication checks pass.

`0dec381` recorded D25. `3f3b470` added strict public configuration, a nullable
Supabase client, SDK-matched dependencies, web local storage, and bounded
double-slot SecureStore chunks whose manifest cannot point at a partial write.
`4ccdd62` added bounded `/v1/me` requests, one exact refresh-after-401 retry,
backend/session identity equality, atomic empty-database binding, populated-data
consent, and hard mismatch rejection. `3d72bce` added the account provider and
accessible Manage data states without adding cloud sync traffic. The full hook,
TypeScript, Expo dependency check, Expo Doctor 20/20, changed-file Fallow audit,
and iOS/Android/web exports pass.

This remains local integration evidence. No real signup email, provider token,
API request, native Keychain/Keystore restoration, foreground refresh, offline
relaunch, or native accessibility flow has been exercised. A Playwright attempt
also confirmed an older web-runtime blocker before Manage data renders: fresh
SQLite bootstrap reaches `src/data/db.ts` through `expo-file-system`, which is
unsupported on web and throws `File.validatePath`. The production web bundle
compiles, but that is not a working-web-runtime claim.

`bae28cb` recorded D26. `972f034` added the atomic D24 mutation snapshot and
durable blocked-mutation storage. `ff40764` added the injected authenticated
transport: exact-body serialized push, strict paged pull, bounded transient
retry, one refresh-after-401, and a process mutex. `00bdc91` triggered the run
after verified connection, explicit **Sync now**, and signed-in foreground
entry, and surfaced bounded status in Manage data. Nine transport tests plus
thirteen local sync tests, the full repository hook, and the server suite pass.

`4ecaeb1` then fixed the first real cross-boundary defect, which no test on
either side could see. `pg` parses Postgres `date` columns into local-midnight
`Date` objects, so `shift_date` and `effective_from` were serialized as full
JavaScript date strings rather than `YYYY-MM-DD`. The client decoder rejects
anything else, so every pulled shift and withholding setting would have failed
as malformed. The server now reads those columns as raw wire text, and the pull
assertions cover them.

That defect is the important lesson of this unit: the wire contract is written
twice, in `server/src/syncContract.ts` and `src/sync/wire.ts`, and both sides
were tested only against their own idea of it. The transport tests use a
hand-written fake `fetch`, so the real serializer never met the real decoder.
Both suites passed while the feature was broken end to end.

`4918b8d` closed that gap by feeding a real server pull response into the real
client decoder for all three entity types, using the existing
temporary-PostgreSQL helpers rather than new scaffolding. Staging is no longer
the first place the two halves meet.

The three smaller D26 review findings are also closed, in `4f0a061` on
2026-08-06:

1. An unexpected sync error reported as `blocked`, which told the user a record
   needed review when the real cause was a database that would not open.
   Unknown failures now report as `failed`.
2. Supabase emits a new session object on `TOKEN_REFRESHED`, which re-ran the
   sync effect roughly hourly. The token is now read from a ref and the effect
   is keyed on the account id, so the triggers stay the three D26 lists.
3. `applySyncResult` was defined after the component's `return`. It moved above
   its caller.

The first complete local federal-withholding slice remains implemented: bounded
2026 math, effective-dated per-job settings, lossless backup, and an opt-in
one-paycheck UI. No paycheck, taxable-wage input, or calculated result is
stored. Native interaction evidence remains open.

Two product decisions were made on 2026-08-04 and are already recorded, so they
do not need re-deciding: overtime adjusts the gross shown on screen rather than
appearing as a second number beside it (D14, revised), and shift times plus the
employer's workweek are stored rather than assuming a midnight boundary (D18).

`330876a` added `src/data/migrations/2-to-3.sql`, updated `schema.sql`, fixed
the migration runner in `db.ts`, and extended `test-schema.sh` and
`test-migration.sh`. The 36 schema checks, 1-to-3 chain test, and
fresh-versus-migrated parity check pass. A physical iPhone then migrated the
real version-2 database with 845 shifts; the app opened and its five year totals
remained 133 / 227 / 162 / 223 / 100.

The runner rewrite is a bug fix, not just plumbing: it applied a single file
and then stamped the newest version number, which was correct only while there
was exactly one hop. A version-1 database upgrading to version 3 would have
received `1-to-2.sql` and a version-3 marker.

`0097a76` added the per-job overtime settings inside Manage data. Each active
job can opt in independently and store the employer's weekday and start time;
turning the estimate off preserves that boundary for later. The screen uses
the platform time picker and states the 40-hour/1.5x limit, the untimed-history
approximation, and the unsupported tipped-credit rules before anything uses
the estimate on screen. Static checks and all three platform exports pass; the
new controls still need their native runtime pass.

`5642874` now derives one overtime-adjusted gross per shift in memory and feeds
that same value through Log rows and calendar groups plus every Trends chart,
headline, and breakdown. Configured jobs carry an explicit estimate label;
mixed scopes are estimated if any included job is configured. Untimed-history
scopes state D18's logged-date approximation. SQLite rows stay unchanged, and
the export test pins a 41-hour shift to recorded gross rather than its displayed
overtime estimate. Static checks and all three platform exports pass; the new
labels and totals still need native runtime verification.

`4173c44` now accepts paired Breadmaker-style `h:mm AM/PM` start/end values,
normalizes them to stored `HH:MM`, includes them in duplicate detection and the
preview, and writes them inside the existing all-or-nothing transaction. Direct
assertions cover midnight, noon, overnight shifts, case, leading zeroes,
one-sided fields, malformed fields, and the invalid-file gate that prevents any
write. This is synthetic contract coverage: the supplied Breadmaker export has
only `no data`, so a real timed Breadmaker export remains unverified.

`3a80cac` appends `Start Time` and `End Time` to the existing export order.
Timed shifts emit stored `HH:MM`; untimed history emits blanks. Assertions keep
sorting and RFC 4180 escaping intact and pin Gross to recorded D5 pay even when
the screen shows an overtime estimate. Static checks and all platform exports
pass. Creating and inspecting a timed CSV on a native device remains open.

**Then, in order:**

1. ~~Data layer — `shifts.ts` and `jobs.ts` expose the new columns, and shift
   writes accept optional times.~~ Done in `7e917f4`. The job settings writer
   stays with step 4, where it will have a caller instead of being dead code.
2. ~~The Log form — optional start and end time inputs.~~ Done in `bbc4046`
   with the native platform picker, derived hours, and blank tips as zero.
   Android's imperative dialog path passed in `00bac2c`.
3. ~~Overtime calculation in `src/lib`, pure and asserted: 40 hours per the
   job's configured workweek, 1.5x the shift's own rate, shifts without times
   counted wholly against their logged date.~~ Done in `74ea74d`.
4. ~~Per-job overtime settings UI, opt-in, inside Manage data.~~ Done in
   `0097a76`.
5. ~~Show the adjusted gross with an explicit estimate label while keeping CSV
   export on recorded gross.~~ Done in `5642874`.
6. ~~Teach the CSV importer the Start Time and End Time columns it previously
   refused (D13).~~ Done in `4173c44` with synthetic contract coverage; a real
   timed Breadmaker export is not available for source-format verification.
7. ~~Add times to the CSV export.~~ Done in `3a80cac` without moving the
   existing columns or changing recorded Gross.

The Android regression is complete. `f57e776` enlarged the weekday chart's
shift counts after the API 36 emulator showed that its 10sp captions could
auto-shrink to 7.5sp. `00bac2c` then moved Android's shift-time picker to the
library's imperative dialog API. The final emulator pass covered create/edit,
picker cancellation, derived overnight hours, the Log layout, calendar button
and swipe paging, chart scrubbing, row swipe/reveal/delete, and SQLite survival
across a developer reload. A clean steady-state log window had no app errors,
datetime deprecation warning, or SQLite exception. Haptics are only a no-crash
result because an emulator cannot prove tactile feedback; TalkBack remains a
separate accessibility check.

`db8ac8b` recorded D19's separation between readable CSV and exact JSON
recovery. `741bccb` added the strict version-1 codec; `7f5de6c` added all-row
snapshot reads and empty-only atomic restore; and `67b1547` exposed both paths
inside Manage data, including when the app has no jobs. The contract preserves
every job and shift column, including archives and tombstones, and rejects
unknown versions, fields, unsafe integers, invalid dates/times, duplicate ids,
and orphan shifts before SQLite opens a restore transaction.

The automated database fixture proves complete ordered-row parity, integrity,
foreign keys, and rollback after a bad final row. `a34d940` records those tested
trust-boundary branches for Fallow without suppressing the two unverified native
UI handlers. Expo dependencies, Doctor, TypeScript, every tracked check, and
web/iOS/Android exports pass.

`738f86c` recorded D20's bounded claim. `565967c` then added the pure 2026
Publication 15-T Worksheet 1A calculator. It accepts user-entered federal
taxable wages and actual 2020-or-later W-4 values for one regular paycheck,
uses integer/rational arithmetic with one final cent rounding step, and rejects
unsupported years and invalid inputs. Assertions pin every filing-status and
Step-2 table, every supported pay frequency, worksheet adjustments, exemption,
bracket boundaries, rounding, and failure cases. TypeScript and the repository
checks pass. Nothing persists yet, and the app still makes none of D20's
excluded claims.

`1350a12` recorded D21. `42f3265` then added schema version 4 and the
`federal_withholding_settings` history. `effective_from` is the first paycheck
pay date the row applies to. The unique job/date pair makes the as-of selection
unambiguous, and existing databases gain no invented settings. Backup version 2
preserves every new column; exact version-1/schema-3 backups normalize to empty
settings and remain restorable. Restore is still empty-only, now across all
three tables, and inserts jobs, settings, then shifts.

The 52 schema checks, complete 1-to-4 migration with forced final-hop rollback,
fresh/migrated table-trigger-index parity, permanent v1 fixture, v2 validation,
complete SQLite row parity, TypeScript, Fallow changed-file audit, Expo
dependency check, Doctor 20/20, and web/iOS/Android exports pass. Create and
pay-date lookup functions were not left as unused production APIs; the schema
test pins the as-of query until the tax UI supplies their real caller.

`cf30b1b` adds the opt-in Federal withholding surface inside Manage data. It
saves a new settings row with a plain bound `INSERT`, rejects duplicate
job/effective-date history instead of overwriting it, loads the newest setting
on or before the paycheck pay date, and passes user-entered paystub federal
taxable wages to D20's calculator. The result repeats every calculation input
and remains labeled “Estimated 2026 federal withholding.” The complete D20
exclusion disclosure is visible before entry. Nothing stores the paycheck
wages or result.

Pure assertions cover strict optional/required dollar parsing, date and year
rejection, row-to-calculator mapping, exemption, disclosure language, and
SQLite duplicate-error recognition. The full hook, TypeScript, Expo dependency
check, Doctor 20/20, and web/iOS/Android exports pass. Fallow reports no dead
code or duplication. Its changed-file audit retains three unsuppressed native
complexity estimates: the form, save handler, and calculate handler. Those are
not suppressed because their alerts, keyboard/picker behavior, SQLite writes,
and result transitions have not run on a device.

**Native acceptance detail:** run the isolated native acceptance pass before
adding more features. On iOS and Android, verify the schema-3-to-4 migration preserves the
real database; open/close the opt-in tool; use both date fields and keyboard;
save ordinary, Step-2, Step-3/4, and exempt settings; prove a duplicate date
does not overwrite; calculate before the first setting and on both sides of a
settings change; reject invalid money/date and a non-2026 pay date; confirm a
zero exempt result; inspect all input/result/disclosure text at large text; and
exercise VoiceOver/TalkBack focus, labels, radio state, switches, and 44pt
targets. Export backup v2, restore it only into an isolated empty install, and
compare every ordered column from all three tables plus `user_version`,
`integrity_check`, and `foreign_key_check`.

The backend design and local foundation are now complete under D22. After the
native gate and external provider choices, the next implementation phase is the
optional mobile email/password flow followed by explicit push/pull sync,
idempotency, retry, bootstrap, and conflict UI contracts.

The isolated native restore acceptance pass remains open: export the real
845-row database on a fresh install, restore it, then compare
`PRAGMA user_version`, `integrity_check`, `foreign_key_check`, and every ordered
column from all jobs and shifts. Do not run the drill against the only copy.
Also verify picker cancellation, invalid-file messaging, and the nonempty-
database refusal on iOS and Android.

Optional accounts and authenticated cloud sync do not block pure local tax
math. They still must precede any public tax projection or launch. D22 settles
the provider, recovery ownership, cloud/local deletion boundary, and conflict
authority. D28 settles the host, the region, and how deployment happens. Plans,
retention, and SMTP remain open; client clocks are never conflict authority.

Android is no longer the stale platform. Its full regression passed on the API
36 emulator. Neither platform has a VoiceOver or TalkBack claim.

---

## How this file works

The history below is append-only. Each entry is one session's worth of work,
summarized — not the command-level detail, which is
[build-log/](build-log/)'s job, and not the reasoning behind a choice, which is
[decisions.md](decisions.md)'s.

Before ending a session: add an entry, rewrite the `NEXT` section above, update
the `Last updated` date. That update is what the next cold agent reads.

---

## Settled stack

Reasons live in [decisions.md](decisions.md). Don't re-litigate without a new
reason.

- **Language:** TypeScript
- **UI:** React via React Native
- **Framework/tooling:** Expo (D2)
- **Navigation:** Expo Router with native peer tabs (D7, D11)
- **Storage:** SQLite on device via `expo-sqlite` (D1)
- **Backend:** optional-account Node/Express/Postgres, with mobile auth and
  sync routes (D1, D22, D24)
- **Hosting:** AWS Lambda behind an API Gateway HTTP API in `us-west-2`, with
  Supabase Postgres reached through its transaction pooler (D28)

---

## Open questions

**Where does the tax logic live?** Resolved by D20: the versioned pure
calculator runs on-device so an optional account never becomes a network
requirement. Supporting a new tax year requires reviewed tables and an app
release; unsupported years fail instead of reusing stale rules.

**Should each shift row show its own gross?** Raised 2026-07-30 while writing
D5. The totals row claims a number the list underneath can't currently be used
to verify, because rows show hours, tips, and rate but not their own gross.
D5's correctness argument doesn't depend on this, but the feature would make
the total checkable at a glance. Deliberately not built as part of Layer 0.

**Exactly when does cloud backup and sync ship?** D1 and D22 settle the
architecture, and the local backend foundation now exists. Cloud backup has
not shipped: there is no hosted service, mobile login, or sync endpoint. Those
follow the native acceptance gate and the provider plan, region, retention,
SMTP, and budget choices recorded above, before public tax projections or
launch.

---

## Housekeeping before submission

- Apple Developer Program: $99/year — **done**, membership already active (used
  2026-07-30 to build a custom Expo Go via `eas go` for device testing, see
  [learning/tooling.md](learning/tooling.md)). Google Play: $25 one-time, still
  outstanding. Apple review takes days and can reject.
- A public app needs a privacy policy URL even if it stores nothing remotely.
- App name availability on both stores. "Tip Tracker" is likely taken.

---

## History

1. Created directory `tip-tracker`
2. Created `README.md`
3. `git init`, first commit, pushed to GitHub
4. Created the brainstorm log — the ancestor of this file
5. Defined the problem, the differentiators, and what's out of scope
6. Split the feature set into MVP + three later layers
7. Decided architecture: local-first, SQLite on device, sync added later (D1)
8. Decided platform: Expo (React Native, TypeScript) (D2)
9. Data model written as `schema.sql` — `jobs` and `shifts`, checked by hand
   against sqlite3
10. Split the decision log out into its own file once the brainstorm passed 750
    lines, and added `scripts/check-docs.sh` plus a git pre-commit hook to stop
    docs rotting
11. First code review of the repo. `check-docs.sh` turned out to print FAIL and
    exit 0, so nothing it found had ever blocked a commit; `schema.sql` still
    cited D1 in the wrong file; and the claim that constraints were tested had
    no tests behind it. Fixed all three, added `scripts/test-schema.sh`, gave
    shifts a tombstone (D4), rewrote `README.md`, archived the Q&A log
12. Installed `sqlite3` and DB Browser for SQLite (both via `winget`), since
    `test-schema.sh` had been silently skipping on that machine the whole time
    (`WARN sqlite3 not installed`). Verified the suite actually catches a broken
    constraint by loosening a `CHECK` and watching it fail, not just trusting
    the 19-checks-passed output. Found `core.hooksPath` wasn't actually set
    despite being documented as done, and re-ran it. Split the Q&A archive
    again, this time by purpose
13. Built a cold-agent handoff system, since `CLAUDE.md`'s old "Start here"
    section (status + next task, restated) had already drifted from the real
    Order of Operations once. Thinned `CLAUDE.md` down to a pointer instead of
    a second copy, added an explicit handoff protocol, and taught
    `check-docs.sh` two new warnings: `core.hooksPath` not set to `.githooks`,
    and a status log's `Last updated` date going stale while other work is
    committed. Both verified by triggering them on purpose before trusting them
14. Scaffolded the Expo app. `create-expo-app` refuses a non-empty directory,
    so it ran into a throwaway subdirectory and the result got moved up by hand
    instead. That meant `app.json`'s `name`/`slug` and `package.json`'s `name`
    came out as the throwaway directory's name — caught by `expo-doctor`, fixed
    to `tip-tracker`. Kept the project's real `CLAUDE.md` over Expo's generated
    stub, and merged Expo's `.gitignore` rules into the existing file rather
    than overwriting it. Verified with `tsc --noEmit`, `expo-doctor` (20/20),
    and an actual `CI=1 expo start` bundling and serving before committing
15. Added the build log: commit-by-commit, detailed enough to recreate the repo
    from scratch, separate from the decision log (why) and this file (what's
    next). Backfilled all 18 commits so far. Gave it the same staleness check
    `check-docs.sh` already ran against this file's `Last updated` date,
    verified by breaking it on purpose first
16. Wired `schema.sql` into `expo-sqlite` (`db.ts`). Opens the connection,
    turns on `PRAGMA foreign_keys = ON`, then runs `schema.sql` — shipped as a
    bundled asset via `metro.config.js` rather than duplicated as a JS string,
    so `db.ts` and `test-schema.sh` always run the same source of truth.
    Guarded against re-running the `CREATE TABLE` statements on every launch
    with `PRAGMA user_version`, since `schema.sql` deliberately has no
    `IF NOT EXISTS`. Confirmed working on a physical iPhone. Getting there
    needed a detour: the App Store's Expo Go build was still on SDK 54 while
    this project is on SDK 57 (Apple's review lag on Expo Go itself, a real and
    current gap, not a local issue). Fixed with `npx eas-cli@latest go`, which
    builds a custom Expo Go matched to our SDK and ships it via a personal
    TestFlight team — needs an Apple Developer Program membership, and the App
    Store Connect API key it generates needs the **Admin** role, not App
    Manager, since only Admin can manage the certificates EAS needs to sign
17. Revisited "screen sketches next" before starting it: this app has no server
    backend at all in MVP (D1), so "build the backend first" doesn't apply the
    normal way. What a screen actually needs first is a small data-access layer
    — plain functions wrapping SQL. Reordered to: data-access functions per
    table, then the screen that calls them, one vertical slice at a time
18. Wrote `jobs.ts`: `createJob` and `listActiveJobs`, using `expo-crypto`'s
    `Crypto.randomUUID()` for ids. First pass at `listActiveJobs` copied
    `createJob` almost verbatim instead of adapting it — still an `INSERT`,
    still generating a new id and timestamp. Rewritten to actually read:
    `db.getAllAsync<Job>(...)` instead of `db.runAsync(...)`, filtering
    `archived_at IS NULL` per D3. Verified with `tsc --noEmit`
19. Wrote `shifts.ts`: `createShift` and `listShifts`, same pattern.
    `hourlyRateCents` is a required argument rather than looked up from the job
    inside the function — `schema.sql` is explicit that the column copies the
    job's rate at the moment of the shift, not a live reference. `listShifts`
    takes no filter arguments for now and leaves grouping to the caller
20. Built the log-a-shift screen — first real UI in the app, and the first time
    writing React/React Native by hand this project. `CreateJobForm` built as a
    fully worked example (never done this before, so nudging would've wasted
    time — a full annotated example was the right call, same reasoning as the
    earlier `db.ts` moment). `LogShiftForm` and the `App.tsx` wiring built the
    same way after that. `ShiftList` added alongside, since MVP Layer 0 needs
    "see a list of past shifts," not just log one. Concepts worth revisiting:
    `useState` initializers only run once at mount, and controlled inputs /
    callback props as the two-way data flow between a form and its parent
21. Confirmed the log-a-shift screen for real on a physical device: created a
    job, logged several shifts, all showed up correctly in the list. First time
    anything in this app has been exercised as an actual user would
22. Added delete: `deleteShift(id)` as an `UPDATE` setting the D4 tombstone
    rather than a real `DELETE`. `ShiftList` got a Delete button per row behind
    a native confirmation (`Alert.alert`, no new dependency) — destructive from
    the user's point of view even though it's soft under the hood. Shipped as
    two commits, not three: the data-access function stood alone fine, but
    `ShiftList`'s new required `onShiftDeleted` prop broke `App.tsx`'s existing
    call site immediately, so there was no working intermediate state to split
23. Confirmed delete on a physical device: logged a shift, tapped Delete,
    confirmation prompt showed, shift disappeared after confirming
24. Added edit: `updateShift` mirroring `createShift` as an `UPDATE`.
    `LogShiftForm` reused rather than duplicated — takes an optional
    `editingShift` prop, pre-fills from it, gets a Cancel button while editing.
    Resolved the gap flagged at step 20: `useState` initializers only run once
    at mount, so switching from editing shift A to shift B wouldn't update the
    fields — fixed with a `key` tied to `editingShift?.id ?? 'new'`, React's
    standard fix (force a remount) rather than syncing state with a `useEffect`
25. Confirmed edit on a physical device. Create, list, edit, and delete are all
    verified working for real — the full CRUD loop for shifts is proven
26. Verified the whole toolchain on a new machine (moved from a Windows desktop
    to a MacBook): hooks path, `expo-doctor` 20/20, `tsc`, both check scripts,
    Metro bundling for iOS and Android, push credentials. Everything passed
    with no fixes needed. Worth knowing what's *not* installed rather than
    rediscovering it: no full Xcode (Command Line Tools only, so no iOS
    simulator — `npm run ios` won't work), no Android SDK, no watchman. Expo Go
    on a physical device is unaffected and is how this project gets tested
    anyway. Node is v26.5.0, newer than Expo SDK 57 was tested against — it
    bundles clean, but it's the first thing to suspect if Metro ever throws
    something nonsensical
27. Gross totals, which completes MVP Layer 0's own scope. `totals.ts` is the
    first pure-calculation module in the project — no SQLite, no async, no
    React — which is what lets `totals.test.ts` run the money math on Node with
    no device and no database. That test uses no framework at all: Node runs
    TypeScript directly and `node:assert/strict` is standard library, so it
    costs zero dependencies. Wired into the pre-commit hook, then broken on
    purpose to prove it fails. D5 is the real decision — wages round per shift,
    not once per total. `format.ts` came out of the same work once a third
    place formatting cents appeared. Concepts worth revisiting: `reduce` as a
    `for` loop with the bookkeeping removed (its starting value is what makes
    an empty array return zeros instead of crashing), and `import type` as a
    real runtime distinction rather than a style choice — it's what keeps
    `totals.ts` loadable outside the app
28. Restructured the repo. Application code moved into `src/` with three
    folders that name the architecture boundary the project already argued for
    — `components/` renders, `data/` persists, `lib/` computes with no I/O.
    Docs reorganized by the question each one answers, and dates dropped from
    filenames everywhere except the build log, where chronology is the content.
    The old `YYYY-MM-topic.md` scheme had quietly reintroduced the exact
    problem the no-numbered-sequels rule exists to prevent: finding the Expo
    question would have meant remembering which month it was asked in. Also
    replaced the hard 500-line split threshold with a 250-line review prompt,
    since length was only ever a proxy for "is this still one topic?"
29. Confirmed gross totals on a physical iPhone, using three shifts chosen to
    break a wrong implementation: `8.6h`, `$42.75`, `$175.31`, exactly as
    predicted. `Intl.NumberFormat` works on Hermes, so the `toFixed` fallback
    isn't needed. Layer 0's feature set is complete and verified end to end.
    The same session surfaced four defects, listed in `NEXT` above. The
    important one is that shifts were logging against the UTC calendar day
    rather than the local one — a correctness bug that no amount of bundling
    or unit testing was going to catch, because it only shows up when a real
    person looks at a real screen late at night. Worth remembering as an
    argument for on-device testing every step, which this project already does
30. Fixed all four, one commit each. The date bug moved its arithmetic into
    `lib/dates.ts` so it could be tested at all — the function now takes a
    `Date` instead of reading the clock, and the tests build every `Date` with
    the local-time constructor so they hold in any timezone. The edit-form
    numbers got D6 and a test that walks all 1440 durations in a day checking
    each one converts back to the same stored minutes; the tempting fix of
    matching the list's `7.6h` fails that test on the first iteration by
    turning a one-minute shift into zero. The layout and keyboard fixes are
    one change in two commits: handing the form to `ShiftList` as its header
    makes the screen a single scroller, and only then do
    `keyboardShouldPersistTaps` and `keyboardDismissMode` have anything to act
    on. Concepts worth revisiting: `toISOString()` is always UTC and is almost
    never what a calendar-day question wants, and `ListHeaderComponent` must
    be handed an element rather than a function, or React remounts the header
    on every render and the keyboard closes on every keystroke
31. Confirmed all four fixes on a physical device: the date defaults to the
    local day, the edit form shows `7.58` and `15.50`, saving an untouched
    shift leaves the list and totals unchanged (the D6 round-trip holding in
    practice, not just in a test), the screen scrolls as one surface, and the
    keyboard dismisses on a tap away and on a drag. **Layer 0 is done** —
    every feature in its scope is built, tested, and verified on real
    hardware. The four defects it took a device to find are the argument for
    keeping that habit through Layer 1
32. End-of-session audit. Logged the three questions from this session that had
    been answered in conversation but never written down — the doc-structure
    and root-layout complaint, how to weigh two options when neither is
    obvious, and how usability defects sort against features. All three are in
    [learning/docs-and-process.md](learning/docs-and-process.md). Fixed the
    last stale reference in `check-docs.sh`, whose comment still used a
    directory the restructure deleted, and added a note to
    [learning/README.md](learning/README.md) explaining that Q&A entries name
    files as they were named on the day they were asked, pointing at the rename
    table in the build log rather than rewriting history. Note that this
    session ran past midnight: entries dated 2026-07-30 and 2026-07-31 are the
    same sitting
33. Finished the Layer 1 design boundary before implementation. D7 chooses
    Expo Router at the second screen, D8 keeps aggregation in pure TypeScript,
    D9 keeps exact values beside one bounded native weekday comparison, and D10
    defines the actual product semantics: one all-jobs-or-single-job scope,
    time-weighted rates, gross per hour by weekday, visible sample context,
    calendar month/year totals, and no-data values that stay distinct from
    zero. `NEXT` now starts with tested arithmetic rather than UI
34. Built the Layer 1 arithmetic before its screen. Extracted D5's per-shift
    gross calculation for reuse, then added one pure Trends pass with all-jobs
    or one-job scope, weighted headline and weekday rates, calendar month/year
    totals, strict date grouping, and 18 dependency-free checks. The work
    exposed an older input-boundary gap: the form can still save a malformed
    date, so `NEXT` closes that before routing or UI
35. Closed that input boundary before exposing Trends. One strict calendar
    parser now serves the form and aggregation code, impossible dates and
    malformed numbers produce visible native alerts, and date coverage grew
    from 5 to 11 checks. Rechecked the SDK 57 Router and native-tabs references;
    `NEXT` now asks only which Router shell and refresh boundary fit this app
36. Chose the concrete Layer 1 route boundary in D11. Log and Trends are static
    native peer tabs; route files stay thin; screens own focused SQLite reads;
    no Context, external store, custom tab bar, or empty nested stack is added.
    The old app-root wiring would become `LogScreen.tsx` once Router owned entry
37. Implemented Layer 1's route and UI boundary. Expo Router now owns the app
    entry, Log and Trends are native peer tabs, and both screens refresh their
    own SQLite snapshot on focus. Trends renders D10's tested all-history
    summaries with exact text and D9's dependency-free weekday bars. Corrected
    Router's transitive React DOM peer from 19.2.8 to Expo SDK 57's 19.2.3;
    npm's dependency tree and Expo's online compatibility check now pass. The
    tracked checks, TypeScript, and fresh iOS and Android exports pass. Physical
    iPhone validation remains the next gate, so Layer 1 is implemented but not
    yet claimed as device-verified
38. Closed the final generated-config and learning-log gaps during the handoff
    audit. Expo Router's first typed-route generation added the required hidden
    route types to `tsconfig.json`; preserved that SDK 57 requirement while
    restoring the explanatory comments its JSON rewrite removed. Also logged
    the previously missed question about continuing a Claude session in VS
    Code with Codex. The tracked checks and TypeScript pass, and `NEXT` remains
    the physical iPhone verification rather than expanding scope
39. Completed the first Layer 1 physical-iPhone pass. The calculations looked
    correct, while real use exposed low-contrast sample text, the missing path
    to create job two, an unsatisfying tips-per-hour headline, and a preference
    for vertical weekday bars. The last report originally cut off after
    `exep`; the user clarified that they meant user experience before the chart
    direction changed. Fixed each concern as a separate verified and pushed
    commit: `d9341fa` corrects card contrast, `02a7120` reuses the existing job
    form after job one, `4714516` makes time-weighted gross per hour the tested
    headline, and `ac65e6a` turns the dependency-free weekday comparison
    vertical while retaining exact values and sample context. Revised D9 and
    D10 rather than erasing their original reasoning. TypeScript, all tracked
    checks, the 18 Trends checks, and fresh iOS and Android exports pass. A
    browser preview was not applicable because this mobile checkout omits
    `react-native-web`; no test-only dependency was added. The four corrections
    still need their physical-iPhone recheck, and Android remains bundle-only
40. Ran the explicit freshness and cold-agent handoff audit. Refreshed the
    GitHub remote, confirmed no stashes or uncommitted work, and found one real
    stale implementation/comment pair: `CreateJobForm` still described itself
    as a first pass and silently ignored invalid input. Commit `0b5b8aa` now
    uses the same strict number parsing and visible native-alert behavior as
    the shift form. Commit `4f1408d` makes the baton path discoverable from the
    tracked `AGENTS.md`, replaces a tracked reference to ignored `CLAUDE.md`,
    and ignores local Fallow/Playwright caches. Fallow's local command still
    hangs without output and was stopped; its documented fallback completed
    instead. Its stricter unused-code check found and removed one dead
    `LogScreen` import in `1035266`; the final sweep also narrowed one outdated
    tips-or-gross helper comment to the gross rate the app now calculates. The
    tracked checks, TypeScript, Expo compatibility, React peer tree,
    current-facing terminology sweep, and native exports pass. `NEXT` remains
    the physical-iPhone correction recheck, now including the new invalid-job
    alert
41. Completed the Layer 1 correction recheck on the physical iPhone. The user
    confirmed the empty-job alert, second-job creation and inherited rate,
    readable time-weighted gross-per-hour headline and job filters, all seven
    proportional weekday bars with exact values and sample context, scrolling,
    safe areas, and both tabs. This closes Layer 1's iPhone acceptance gate;
    Android runtime behavior remains unverified and is now `NEXT`
42. Completed the Layer 1 Android-emulator acceptance pass. The user confirmed
    the prescribed Log and Trends checklist passed without reporting a runtime
    defect. Combined with the physical-iPhone result, Layer 1 is now verified
    across both target platforms. The next product need is importing the user's
    existing nine-column shift history without rounding away its hundredths of
    an hour, so exact duration preservation and CSV import replace platform
    verification in `NEXT`
43. Migrated canonical shift duration from integer minutes to integer seconds.
    Version 2 renames and scales existing values atomically, while all data,
    calculations, forms, totals, and Trends now use seconds. The migration test
    proves non-duration fields, tombstones, archived relationships, constraints,
    foreign keys, and rollback survive; the edit-format check exhaustively
    round-trips every duration from one second through 24 hours
44. Added the first format-specific CSV importer. The Log screen now chooses a
    destination job, reads a native document, validates the exact nine-column
    contract and every row, previews totals and conflicts, then appends all
    rows in one exclusive SQLite transaction after confirmation. The supplied
    845-row file imported successfully in Android, refreshed Log and Trends,
    and produced 845 exact-match warnings when selected again. Static iOS and
    Android exports pass; physical-iPhone picker verification is now `NEXT`
45. Shipped the requested product revision in three verified commits. Trends
    is now the real index/home tab and Android's native tab bar stays opaque.
    Log puts outlined job-management and CSV actions before the shift form;
    removing a job archives it, preserves named history, and is covered by the
    schema check. Trends defaults to average gross/hours per worked week and a
    compact Year view, with All time and Month/Weekday choices. The supplied
    845 rows calculate to 198 worked weeks, $645.61/week, 20.1h/week, and
    $32.14/hr. The tracked hook, TypeScript, Expo dependency check, Fallow
    changed-file gate, and Android interaction pass. D14 records why overtime
    and tax math require profiles instead of guessed universal percentages.
46. Added the requested interactive dashboard in `5bf1375`. Trends now opens
    with one large gross-income line, exact wage/tip/hour text, 1W/1M/3M/1Y/All
    ranges, job scope, and nearest-point touch inspection. The supplied 845-row
    history condenses to 51 monthly All points instead of a multi-year daily
    scroll. D9 now records why this uses one Expo-supported SVG primitive
    dependency rather than a chart framework or misleading investment-style
    red/green semantics; D10 pins the tested calendar buckets and newest-shift
    anchor. Log now orders form, totals, management, then history. Shift Delete
    is visually concealed until a left swipe, while long press and a screen-
    reader action reach the same soft-delete confirmation. React Native's own
    gesture and animation primitives handle both interactions. The tracked
    hook, TypeScript, Expo dependency check, Fallow changed-file audit, fresh
    iOS/Android exports, and Android cold-runtime interactions pass. Physical-
    iPhone CSV, gesture, and VoiceOver verification remains in `NEXT`.
47. Refined the shipped dashboard from device feedback, in `b771c03` and
    `6de533f`. Trends gained a YTD range covering January through the newest
    shift's month, the only range anchored to a calendar boundary rather than
    rolling backwards. Every range now names its window as a date range
    ("Jul 28 – Aug 3, 2026") instead of describing the calculation that
    produced it ("7 days ending Aug 3, 2026"); `TrendSeries` carries
    `startDate` so the window's start stays knowledge of `trends.ts` rather
    than something the chart re-derives. The weekday bars stopped silently
    truncating: their two-line sample label lost the hours on every column
    whose shift count wrapped, so only Saturday appeared to show hours. Hours
    were removed rather than the label widened, since the bar already encodes
    dollars per hour; screen readers still speak them. TypeScript, the tracked
    hook, the schema and migration checks, and all five direct-run test files
    pass. Neither change has run on a physical device.
48. Acted on a second round of device feedback, in `3dc3013` and `d2a28d1`.
    Tapping the income line now jumps straight to that point instead of
    requiring a drag: the chart claims the touch on press-down and hands it
    back if the surrounding scroll view asks, clearing the selection so a
    vertical scroll leaves nothing highlighted. The Log stopped being an
    845-row unbroken scroll — shifts now sit under sticky month headers
    carrying that month's gross and shift count, with every month except the
    newest collapsed, so five years of history is about fifty headers and one
    tap. Rows lead with weekday and day and put the shift's gross on the right,
    since the header already supplies the month and year. D15 records why
    collapsed rather than merely sectioned, and what a future search or job
    filter would change about the default. Grouping lives in
    `src/lib/shiftGroups.ts` with its own assertions so month subtotals stay on
    the same D5 per-shift gross that Trends uses. TypeScript, the tracked hook,
    and all six direct-run test files pass; neither change has run on a
    physical device.
49. Compacted the Log screen on request, in `561bbd7`, `2e134d0`, and
    `4825557`. The tab no longer opens onto seven input boxes: the shift form
    sits behind one filled "Log a shift" button and the job manager and CSV
    importer behind a "Manage data" toggle, so the default state of the screen
    is the history it exists to show. Tapping a row still opens the form
    directly. The history went from one level of month sections to a
    year > month > week tree with only the newest branch open, which puts the
    current week on screen with no taps and turns five years into a handful of
    rows. The tree is flattened into one array of typed rows so it still
    renders through a single virtualized `FlatList`; nested scrollers would
    have cost the virtualization that keeps 845 shifts cheap. The Sunday
    week-start rule D10 pins moved into `dates.ts` first, since Trends and the
    Log now both group by week and two copies would drift apart silently. D15
    is revised for the level change, the split of a month-straddling week, and
    the loss of sticky headers. TypeScript, the tracked hook, the schema and
    migration checks, and all six direct-run test files pass; none of it has
    run on a physical device.
50. Made All time the default Trends summary and moved it left of Weekly
    average, in `9958a4f`. D10 is revised for the swap, and the same revision
    backfills YTD and the date-range window labels into D10's chart bullet,
    which had been describing the pre-`b771c03` screen for several commits.
51. Made Weekday the default breakdown and scoped the Trends summary to the
    selected chart range, in `559ebc7` and `2b5fbc1`. Changing the chart range
    used to leave the number beneath it unchanged, which reads as broken range
    buttons; both summaries now cover exactly the shifts the chart drew, via
    `shiftsInWindow` in `trends.ts`. That function is asserted against the
    series for all six ranges — the gross it selects equals the sum of that
    series' points — because a card contradicting the graph above it is the
    failure that matters. The chips are Per hour and Per week now, since "All
    time" stopped being true and the window is stated in the card instead. The
    breakdown stays on all history: scoping it would collapse Month and Year to
    one row under 1W. D10 is amended for both, including the cost of running
    two date scopes on one screen. Breakdown order is Weekday, Month, Year,
    default-first and widening rightward. All checks pass; not yet on a device.
52. Compacted the Log screen further and added CSV export, in `fc9e4d8`,
    `53e4764`, and `976bedd`. The lifetime Hours/Tips/Gross strip is gone —
    Trends' All range and the history's own year rows both show those figures
    better, and nothing on the Log screen acted on it; `ShiftTotals.tsx` and
    `calculateTotals` went with it rather than sitting dead, with their D5
    rounding assertions kept and re-pointed at `calculateShiftGrossCents`.
    Manage data now holds an export button under the importer, writing every
    shift to a location the user picks via `Directory.pickDirectoryAsync` — no
    new dependency, since `expo-file-system` was already here. D16 records why
    the export uses its own columns rather than D13's import contract: that
    contract rounds Hours to 36-second granularity and would quietly lose
    seconds from every pre-D12 row. The cost is stated there too — an exported
    file has no importer yet, so this is "get your data out", not "restore".
    All seven direct-run test files pass. The export's picker and file write
    are the parts assertions cannot reach and have never run for real.
53. Reworked the Log screen's layout in `33352ad`. The history was edge-to-edge
    while every control above it sat in a 16pt gutter, and with groups
    collapsed the rows stopped mid-screen against white. Rows are now inset
    into one rounded panel sharing that gutter, and a flexible footer takes the
    leftover height so the panel reaches the bottom, collapsing to nothing once
    the rows overflow. Not yet seen on a device.
54. Reverted `33352ad` in `6d323b3` and replaced it with `187d3e6`. The inset
    panel and full-height filler solved a problem that had not been raised: the
    request was for the compacted Log screen to sit lower on the page, not for
    the rows to be inset or the grey to run to the bottom. The replacement is a
    larger top margin on the closed-state Log a shift button, which moves the
    whole compacted screen down and leaves the open-form state untouched.
55. Landed the Log screen layout request on the third attempt, in `169bf52`.
    `flexGrow: 1` plus `justifyContent: 'center'` on the list's content
    container centers the whole screen vertically while it is short enough to
    fit, and stops applying on its own once the rows outgrow the viewport. The
    fixed top margin from `187d3e6` is removed. The two earlier attempts, the
    inset panel and the top margin, both addressed problems that had not been
    raised.
56. Made every shift group start collapsed, in `a05593f`. The Log tab now opens
    to one row per year; the previous newest-branch-open default reintroduced
    the scrolling the tree removed and left the screen too tall for `169bf52`'s
    centering to do anything. D15 amended, including that every shift is now
    three closed groups deep from a cold open. Also answered and logged a
    question about the CSV importer in `docs/learning/product-and-data-model.md`:
    a file carrying real Start Time or End Time values is refused outright,
    verified by running the parser, because `shifts` has no column for either
    and importing would mean silently discarding them. That refusal is the
    first thing to revisit when D14's overtime work forces shift times to be
    stored.
57. Verified the CSV export on a physical iPhone, the first time
    `pickDirectoryAsync`, `createFile`, and `write` had ever executed. The file
    matched D16's format at 845 rows and its per-year counts agreed with the
    Log tab's own grouping, which is a useful cross-check: the export and the
    on-screen tree derive those totals separately.

    Two real defects came out of it, in `4ee6317`/`0a980f0` and `114f25f`.
    Canceling the picker logged at `console.error`, so a deliberate user choice
    was recorded as a failure and raised a modal confirming something the user
    had just chosen. And the date-only filename made the second export of any
    day fail on a collision, because `createFile` refuses an existing path
    rather than replacing it.

    The cancel fix took two attempts, and the first one failed exactly the way
    the original bug had: both were reasoned out of library source that had
    never been run. `expo-file-system` raises a properly coded exception on
    cancel and then drops the code crossing into JavaScript, which one
    `console.log` in the catch block settled in a single tap. The check now
    matches the message, which is a heuristic and is documented as one — it
    degrades into noise, never into a hidden write error. D16 revised twice,
    with both learning entries in `docs/learning/architecture.md`.

    The through-line for the rest of this pass: every defect found today was in
    code that typechecked, passed every test, and had never once executed.
58. Moved the Log screen's controls below the shift history, in `b04649a`, so
    the primary action sits within a thumb's reach on a cold open rather than
    up by the status bar. The downward nudge on the centred layout had to
    become conditional: padding, unlike `justifyContent`, does not stop
    applying once content outgrows the viewport, so unconditionally it left a
    blank band above an expanded year and pushed an open form off the bottom.

59. Built a calendar picker for the shift date field across `3a8d481` and
    `2ed8544`, with the days that already have a shift dotted, animated month
    paging, haptics, and a month and year chooser behind the header. Typing a
    date still works and is still the primary path.

    `react-native-calendars` was installed and run on the device before being
    rejected, rather than argued about from its dependency list. It rendered
    and dotted correctly; its month swipe did not work, because it depends on
    a gesture library that predates `react-native-gesture-handler` and does not
    survive the New Architecture. D17 records why that settled it, and why the
    requirements here — English only, Sunday already pinned by D10, one date,
    no ranges — make a hand-written grid unusually cheap.

    The animation took three attempts. Two of them re-centred a three-month
    strip after each page, which means moving the strip and swapping its
    contents at the same instant; the first flashed the outgoing month, and
    moving the reset into `useLayoutEffect` did not help because the transform
    runs on the native thread and ordering JavaScript cannot fix a cross-thread
    race. Positioning each month by its distance from an anchor removes the
    re-centre, and with it the race. Frame-by-frame screenshots from the device
    are what identified the flashed month as the outgoing one and pointed at
    the cause.

60. Added Edit beside Delete on a swiped shift row, in `d3d077e`, and made both
    it and a plain row tap scroll to the form — which renders below every row,
    so opening a shift previously changed something off the bottom of the
    screen and looked like nothing had happened. The gesture was also retuned
    after it felt wrong in use: it required horizontal movement to strictly
    exceed vertical, and it let the `FlatList` reclaim the gesture mid-drag,
    which collapsed the row whenever a finger drifted toward its neighbour.
61. Verified Trends on a physical iPhone, closing the device pass. The chart
    ranges and their window labels, the summary card following the range, the
    job filter, and the weekday bars deliberately not following the range (D10)
    all behaved. Three fixes came out of it, in `dcf4901`, `2bb8a78` and
    `e62796d`: the weekday bar captions did not share a baseline because they
    relied on text wrapping, which only happens when the text is too wide to
    fit; `MONTH_NAMES` still had a third copy in Trends after the calendar work
    consolidated the other two; and the chart lost a scrub whenever a finger
    drifted vertically.

    That last one is the same defect as the shift row swipe from `d3d077e`, in
    a different component: a pan responder that never refuses termination
    cannot hold a gesture through the noise of a real hand. Two instances make
    it a pattern worth checking for rather than a coincidence, and no assertion
    in this repo can reach either.
62. Added schema version 3 in `330876a`: optional local start/end times on
    shifts and opt-in overtime plus workweek boundary settings on jobs. The
    migration runner now applies every pending migration in order rather than
    applying one file and stamping the newest version. Automated checks cover
    36 schema behaviors, version-1-to-3 chaining, rollback, preservation, and
    fresh-versus-migrated structural parity. A physical iPhone migrated the
    real version-2 database containing 845 shifts; the app opened and the five
    year totals remained 133 / 227 / 162 / 223 / 100.
63. Wired schema version 3 into the existing data layer in `7e917f4`. Job reads
    now include the overtime and workweek fields, and shift reads, creates, and
    updates include optional times. Current callers default both times to null;
    the unused job-settings writer was deliberately left for the Manage UI
    commit that will call it.
64. Added native shift-time entry in `bbc4046`. On iPhone, tapping either time
    opens the Apple spinner in 12-hour form while storage remains `HH:MM`.
    Hours derive from the two times when blank, explicit hours still represent
    paid time that differs from elapsed time, and blank tips store zero. The
    flow passed on a physical iPhone. Android support comes from the same native
    module but remains unverified; its documented imperative dialog path is
    deferred with the rest of the Android pass.
65. Began the deferred Android regression with an API 36 ARM64 emulator and the
    verified 845-shift CSV. The weekday breakdown exposed unreadable sample
    counts: 10sp text could auto-shrink to 7.5sp. `f57e776` removed that shrink,
    raised the captions to 13sp semibold text, and passed a live screenshot
    check with all seven counts visible and unclipped.
66. Fixed the Android shift-time picker warning in `00bac2c` by using the
    datetime package's imperative dialog API and current `onValueChange`
    callback. On the API 36 emulator, cancel preserved the blank field, start
    and end selections populated independently, the dialog stayed closed after
    confirmation, and no deprecated-callback or runtime error appeared.
67. Completed the Android regression on the API 36 ARM64 emulator. A temporary
    overnight shift derived eight hours from 9pm to 5am, survived a developer
    reload, edited to nine hours at 6am, and then soft-deleted through the
    concealed row swipe, returning visible totals to their baseline. The Log
    layout, calendar button and swipe month paging, chart scrubbing, and gesture
    ownership all passed. A clean post-reload log window had no app errors,
    datetime deprecation warning, or SQLite exception. Haptics remain a
    no-crash result and TalkBack remains untested.
68. Added the pure overtime calculator in `74ea74d`. It sorts a job's shifts
    chronologically into its configured recurring workweeks, keeps the existing
    straight-time gross calculation, and adds the extra half-rate only after
    40 hours. Assertions cover opt-in behavior, weekly reset, different shift
    rates, a threshold inside a shift, a non-midnight boundary, paid duration
    that differs from elapsed time, untimed history, and invalid dates.
69. Audited the whole repository for stale code, comments, tests, dependencies,
    and documentation. `f9029dd` aligned Expo SDK 57 patches; `bd492f8`
    replaced stale per-test Fallow suppressions with one real entry-point rule;
    `0288662` corrected current status and CSV-import wording; and `b7a7fa1`
    restored the advertised web build with `react-native-web` and SQLite's
    required WebAssembly asset handling. `6a72b00` records that implicit Expo
    runtime dependency for Fallow, and `df72ade` refreshed the one compatible
    stale type-definition lock entry. Clean-install iOS, Android, and web
    exports pass. Mutation checks proved the money, schema, migration, and doc
    checks reject deliberately broken copies. The remaining npm advisory is in
    Expo's build-time `uuid` chain and has no non-breaking fix; the Fallow
    complexity findings are documented in build-log phase 18 rather than
    triggering an unrelated UI refactor.
70. Preserved paired CSV shift times in `4173c44`. The known nine-column
    adapter accepts only blank/`no data` pairs or strict 12-hour `h:mm AM/PM`
    pairs, normalizes real values to `HH:MM`, previews and stores them, and
    includes them in exact-duplicate warnings. Synthetic assertions cover the
    conversion and invalid-file gate; the supplied Breadmaker file contains no
    real times, so real timed-source evidence remains open.
71. Appended stored Start Time and End Time to CSV export in `3a80cac` without
    moving the existing columns. Assertions cover timed, untimed, and overnight
    shifts while retaining stable ordering, escaping, exact seconds, and
    recorded rather than overtime-estimated Gross. This closes the automated
    overtime scope; native timed-import/export and accessibility evidence stays
    open.
72. Added versioned local backup and empty-only restore across `db8ac8b`,
    `741bccb`, `7f5de6c`, and `67b1547` (D19). JSON preserves every stored job
    and shift field while CSV remains the readable spreadsheet export. The
    parser validates the whole bounded document before writes; SQLite restores
    jobs before shifts in one exclusive transaction, checks foreign keys, and
    compares every ordered row before commit. Direct tests cover the contract,
    complete-row parity, integrity, and rollback. All platform exports pass;
    the real 845-row isolated native restore drill remains next rather than
    being inferred from automated fixtures.
73. Bounded the first tax claim in D20 (`738f86c`) and added its pure 2026
    federal withholding calculator in `565967c`. The implementation follows
    Publication 15-T Worksheet 1A and the automated percentage tables for one
    regular paycheck, keeps intermediate math exact, and rounds once to cents.
    Direct assertions cover every supported status, Step-2 schedule, pay
    frequency, W-4 adjustment, boundary, and rejection path. No schema,
    persistence, UI, or broader tax claim was added.
74. Defined D21 in `1350a12` and implemented effective-dated per-job federal
    withholding settings in `42f3265`. Schema version 4 adds one history table;
    backup version 2 preserves it, while permanent version-1 fixtures prove old
    schema-3 backups normalize to empty settings and still restore. Automated
    checks cover every constraint, pay-date selection, 1-to-4 migration and
    rollback, fresh/migrated parity, strict codec failures, foreign keys, and
    exact three-table restore. No tax UI, paycheck, result, backend, account,
    dependency, or unused create/lookup API was added.
75. Added the complete local one-paycheck withholding surface in `cf30b1b`.
    Manage data now opts into per-active-job W-4 history and a 2026 regular-pay
    estimate using paystub federal taxable wages. Bound data operations create
    history without overwrite and select settings as of the paycheck pay date.
    Pure tests cover input/date/year/exempt/disclosure/error mapping, and all
    static, repository, and platform-export gates pass. Three native form/save/
    calculate Fallow estimates remain deliberately unsuppressed until the iOS
    and Android acceptance pass. No paycheck, result, backend, auth, or new
    dependency was added.
76. Built the authenticated backend foundation. `8451e78` added remote-JWKS
    access-token verification and the account lifecycle, and the remediation
    series `2023f23` through `9926627` closed the review blockers it opened:
    durable deletion tombstones, recent-password proof, Supabase identity
    deletion with retry semantics, canonical UUID subjects, lossless local text
    identifiers and `HH:MM` times, checksum-tracked transactional migrations,
    schema-aware readiness, and bounded HTTP failure coverage. Seven server
    tests use real temporary PostgreSQL databases where persistence matters.
    The full repository hook passes and Fallow reports no server health finding
    without a suppression. No mobile client, sync route, provider resource, or
    deployment was added. See build-log 23.
77. Laid the local sync foundation. `402988d` recorded D23; `d68c2e1` then
    added schema version 5 — trigger-owned dirty-row tracking, monotonic local
    sequences, per-row server metadata, one canonical account binding, a server
    pull cursor, and an exclusive remote-apply transaction that cannot
    re-enqueue pulled rows. The 4-to-5 migration enqueues existing active,
    archived, and tombstoned domain rows while a fresh database starts empty.
    Federal settings retain tombstones and backup version 3 preserves them,
    with version-1/schema-3 and version-2/schema-4 files still restorable.
    `28057dd` separated Expo and server TypeScript checks by their real package
    boundary. Real SQLite assertions cover direct-SQL capture, repeated-edit
    compaction, in-flight acknowledgements, migration bootstrap and rollback,
    restore rollback, parent-first remote apply, pull rollback and suppression,
    dirty-row conflict protection, and account mismatch rejection. Local
    plumbing only: no provider, network retry, conflict UI, or native migration
    of the developer's real database. See build-log 24.
78. Implemented the provider-free server half of sync. `7629f05` recorded D24
    as the wire and conflict contract. `3dce9d6` added migration 002 and
    `1bc12a9` corrected its replay scope before any endpoint shipped, since
    account plus local sequence collides when two devices both start at one;
    the corrected key is account, canonical device UUID, and operation id.
    `eafcc45` added the strict one-mutation route with optimistic server
    versions, exact replayed successes and conflicts, retained tombstones, and
    no guessed deduplication. `ff8e6b3` persisted device sync identity and
    failures, `38256bd` added the strict paged pull across all three entity
    tables, and `871e20a` narrowed the service types. Real temporary PostgreSQL
    plus local JWKS tests cover tenant isolation, duplicate-looking shifts,
    archives, tombstones, stale and unique conflicts, replay misuse, payload
    ceilings, transaction rollback, pagination, cursor order, and account
    spoofing. Eleven server tests and the full hook pass. No mobile
    authentication, HTTP client, retry scheduler, provider resource, or
    deployment claim was added. See build-log 25.
79. Added optional mobile accounts. `0dec381` recorded D25: Supabase owns email
    and password identity, the app sends its access token only to Express, and
    SQLite stays fully usable signed out. `3f3b470` added strict public
    configuration, a nullable Supabase client, and bounded double-slot
    SecureStore chunks whose manifest cannot point at a partial write.
    `4ccdd62` added bounded `/v1/me` requests, one exact refresh-after-401
    retry, backend/session identity equality, atomic empty-database binding,
    populated-data consent, and hard mismatch rejection. `3d72bce` added the
    account provider and accessible Manage data states without adding sync
    traffic. The hook, TypeScript, Expo dependency check, Expo Doctor 20/20,
    changed-file Fallow audit, and platform exports pass. Local integration
    evidence only: no real signup email, provider token, API request, native
    Keychain or Keystore restoration, or accessibility flow was exercised.
    A Playwright attempt also confirmed the older web-runtime blocker later
    settled by D27. See build-log 26.
80. Added the mobile sync transport. `bae28cb` recorded D26: local writes never
    wait for the network, and one foreground or manual run pushes exact atomic
    SQLite snapshots serially before pulling strict pages. `972f034` added the
    snapshot and durable blocked-mutation storage, `ff40764` the injected
    authenticated transport with bounded transient retry, one
    refresh-after-401, and a process mutex, and `00bdc91` the trigger points
    and bounded status in Manage data. Nine transport tests plus thirteen local
    sync tests pass. `4ecaeb1` then fixed the first real cross-boundary defect,
    which no test on either side could see: `pg` parses Postgres `date` columns
    into local-midnight `Date` objects, so every pulled shift and withholding
    setting serialized as a full JavaScript date string and would have failed
    the client decoder as malformed. The lesson is where the contract lives —
    it is written twice, in `server/src/syncContract.ts` and `src/sync/wire.ts`,
    and the transport tests used a hand-written fake `fetch`, so the real
    serializer never met the real decoder and both suites passed while the
    feature was broken end to end. `4918b8d` closed that gap by feeding a real
    server pull response into the real client decoder. See build-log 27.
81. Made the app release-ready on paper. `87727ee` moved the checks off one
    laptop into GitHub Actions, running `.githooks/pre-commit` itself so
    anything added to the hook is picked up for free, and failing on a missing
    `sqlite3` rather than letting three suites skip themselves green. `4c5dc91`
    added `eas.json` and the two missing store identifiers. `a970a81` bounded
    request volume per client address and `9ef14df` logged one structured line
    per finished request. `3ae6b57` added cloud account deletion from inside
    the app and `02ba072` password recovery by emailed code. `4f0a061` closed
    the three findings D26 left open, chiefly an unexpected sync error
    reporting as `blocked` when the real cause was a database that would not
    open. `2351614` stated what the app collects, `b9d0e66` split the account
    panel by account state, and `3cba32a` removed the web target under D27
    rather than repairing a platform that compiled and then crashed. Nothing
    here was seen on a device, no provider resource existed, and no API was
    deployed. See build-log 28.
82. Deployed the API. `d0a501a` packaged it for AWS Lambda behind the Web
    Adapter layer, which runs the Express app unchanged and needs no build step
    or serverless adapter; `b673a67` deployed it behind an API Gateway HTTP API
    in `us-west-2`, the region the Supabase project resolves into. App Runner
    was the original target and is closed to new customers; a Lambda Function
    URL was built first and returned 403 without ever invoking the function,
    because accounts created recently block public access to Lambda in a way
    that overrides the resource policy (D28). `DATABASE_URL` moved to the
    transaction pooler, the direct host being IPv6-only and unreachable from a
    Lambda outside a VPC. `319b738` shipped the migration files the first zip
    omitted. `/health` answers 200 and `/v1/me` answers 401 from one laptop;
    nothing was exercised by a device, a second address, or concurrent callers,
    and the in-memory rate limiter no longer holds across instances. See
    build-log 29.
83. Audited the whole repository for staleness, the second time after phase 18.
    Five commits had landed after the last handoff update, so both handoff
    documents described a repository that no longer existed. `16edd8d` gave the
    three bare Fallow suppressions machine-readable reasons; `b8e325f` indexed
    build-log phase 29, which had been tracked but unlisted; `a241316` fixed six
    README claims, chiefly that `eas init` still needed running and that the
    Stack table called the backend "None through Layer 1" twenty lines below a
    paragraph describing it on Lambda; `9d0c3fc` deleted the one-sided
    `sessionStorage` platform split and its `.d.ts` shim and Fallow exception,
    left behind when D27 removed the web half; `8e9099b` corrected two comments
    naming things the repo no longer has, including a `TRUST_PROXY_HOPS`
    justification citing the Function URL that the same script deletes; and
    `e8cba27` rewrote the server README's "External gates", which still said
    deployment was waiting on the owner and named Render, a host D28 rejected
    and this project never used. `3df85d6` then moved the CI workflow's two
    actions off the Node 20 runtime GitHub had been annotating on every run.

    Verification went past reading passing output. Seven deliberate mutations
    to the money, schema, migration, doc, wire-contract, backup, and remote-apply
    paths each made their check fail, with a `git diff` confirming the mutation
    landed first — which caught two earlier attempts that reported a surviving
    mutant only because the edit had silently matched nothing. A clean clone with
    fresh `npm ci` passes the full hook; iOS and Android export; the Lambda zip
    builds and its cross-directory import resolves from the packaged layout.

    Three verified exceptions are recorded rather than suppressed:
    `expo-constants`, `expo-linking`, and `react-native-screens` are unimported
    but are declared `expo-router` peers; `ignoreDependencies: ["expo"]` is
    load-bearing and was tested by removing it; and the single `npm audit`
    advisory is fixable only by downgrading to Expo 46, so it stands. No feature
    was added and nothing ran on a device. See build-log 30.
84. Cleared the path to a first build. The three `EXPO_PUBLIC_` values were
    already in the EAS `preview` environment and byte-match the local `.env`;
    the endpoint they name was reached for the first time since D28 and
    answered `/health` 200 and `/v1/me` 401. Three defects stood between that
    and a submittable build. `172b6b7` changed `expo.name` from `tip-tracker`,
    the slug-matching value left over from phase 14 that would have been the
    home screen label, to `Tip Tracker`, and gave the `production` and
    `development` profiles the `environment` key only `preview` had. `7e57e6b`
    set `ios.supportsTablet` to false, because Apple reviews on iPad and
    demands iPad screenshots while no layout here has ever rendered on one.

    The find worth carrying forward is that an unconfigured build fails
    quietly. `loadAuthSetup({})` returns `{config: null, error: null}` — D25's
    supported signed-out state — so a production build with an empty
    environment compiles, passes review, and ships with sign-in and sync
    silently absent. Only a partial config throws. Production is deliberately
    left empty until a preview build has run on a device, since the current
    backend is staging and its Resend sender reaches only the owner. See
    build-log 31.

85. Made the CSV importer read files it had not seen before. Six real exports
    were refused at row 1 because the importer required one exact nine-column
    header line, leaving 2,813 importable shifts unread. `b4bd9e3` accepted ISO
    dates and 24-hour times, both unambiguous supersets. `fc3ef99` replaced the
    fixed header with name matching and made hours and tips map to a list of
    columns that get summed — the same thing the parser already did for cash
    and credit tips, generalized to also cover regular plus overtime hours.
    `22172c3` put the detected columns in the preview above the import button.

    Two measurements shaped it. All 624 rows of one export confirmed that
    `Regular + Overtime` equals the summary column wherever both appear and is
    never blank, so summing beats any formula syntax. And the 790 daily-income
    disagreements split at seven cents: 778 were hours-rounding arithmetic, and
    the 12 real ones were all overtime rows paid at time-and-a-half, which the
    app recomputes itself under D14. Warning on all 790 had buried the 12.

    Detection is a guess and is shown rather than applied silently, since a
    wrong money column produces a history that looks complete and is not. The
    column picker is deliberately unbuilt — `parseShiftImportCsv` already takes
    a corrected mapping, so it is UI work waiting on a file that guesses wrong.
    See D30 and build-log 32.
