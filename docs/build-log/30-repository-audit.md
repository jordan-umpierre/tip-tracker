# Repository audit

## What this session was for (2026-08-07)

The second whole-repository audit, the first being phase 18. Same question:
what in this repo says something that is no longer true? The trigger was five
commits (`1a97318` through `073560a`) that landed after the last roadmap and
build-log update, so by definition the two handoff documents did not describe
the repository a cold agent would clone.

No feature was added. Everything here is either a correction or a deletion.

## Baseline before touching anything

Clean tree, `main` level with `origin/main`, no stashes, `core.hooksPath` set
to `.githooks`. The full hook passed: 74 schema checks, the 1-to-6 migration
chain, backup/restore, 17 server tests, 15 local sync tests, and every
direct-run library test. That matters — the starting point was green, so
everything below is staleness rather than breakage.

## `16edd8d` — chore: attach the three bare Fallow suppressions to their reasons

`fallow suppressions` reported `46 suppressions in 19 files, 3 without
reasons`. All three did have a justification, written as an ordinary comment on
the line above the marker, which Fallow does not read. Every other suppression
in the repo uses the inline `-- reason` form.

Folding the prose into the markers in `IncomeTrendChart.tsx`, `trends.ts`, and
`TrendsScreen.tsx` takes the count to `0 without reasons`. Nothing was
suppressed or unsuppressed; the reasoning just became machine-readable, which
is the whole point of the count.

## `b8e325f` — docs: index the missing build-log phase 29

`29-api-deployment.md` has been tracked since `d554bbe`, but the Phases list in
`build-log/README.md` stopped at 28. `check-docs.sh` cannot catch this: it
checks that links point at files that exist, not that files are pointed at. An
unreferenced file has no dead link to find.

## `a241316` — docs: correct the stale build, layout, and stack claims in the README

Six corrections, all current-facing:

- "Still required before a first build: `eas init`" — `1a97318` already did it.
  `app.json` carries the project id and owner.
- "There is no `env` block" — `d181736` pointed the `preview` profile at its
  EAS environment. The literals are still not tracked, which is the part worth
  saying.
- The repo layout predated `src/sync/`, `contracts/`, and `server/`.
  `contracts/` got a sentence, since the reason it sits outside both sides is
  the D26 drift that made it necessary.
- The local schema is version 6, not 5.
- The Stack table said the backend was "None through Layer 1", twenty lines
  below a paragraph describing it running on Lambda. It now names the backend
  and the host.
- One withholding bullet had a duplicated clause ("no paycheck record or tax
  paycheck record").

## `9d0c3fc` — refactor: collapse the one-sided sessionStorage platform split

The only code change in the session, and it is a deletion.

`3f3b470` added `sessionStorage.native.ts` and `sessionStorage.web.ts` behind a
hand-written `sessionStorage.d.ts`. That shim exists because React Native picks
the platform file at bundle time and TypeScript cannot resolve a `.native`
extension on its own. `3cba32a` then deleted the web half with the web target
(D27), leaving a platform split with one side, a `.d.ts` describing a file
TypeScript could not see, and a `.fallowrc.json` `ignoreExports` entry that
existed for the same reason.

Renaming the file to `sessionStorage.ts` removed all three. The single importer
in `supabase.ts` already wrote `'./sessionStorage'`, so it did not change.

Two things verified this rather than assumed it. `fallow dead-code` still
reports no issues with the `ignoreExports` entry gone, which proves the entry
was only ever compensating for the platform-extension indirection. And the iOS
export produced a byte-identical bundle hash
(`entry-bd72180bb732b67ba85708bdfb14b37c.hbc`) before and after, which is about
as direct as evidence of a behavior-preserving rename gets.

## `8e9099b` — fix: correct two comments that name things the repo no longer has

`deploy-lambda.sh` justified `TRUST_PROXY_HOPS: "1"` with "the Function URL
itself, which puts the caller address in `X-Forwarded-For`". The bottom of that
same script deletes the Function URL and routes through an API Gateway HTTP
API. The value is right — API Gateway is also one hop — but the stated reason
named a component the script removes. The roadmap's caveat moved into the
comment too: this is a reading of how the adapter forwards the address, not
something the request log can confirm, because it records no client address.

`check-docs.sh` pointed a reader at `CLAUDE.md` for the cold-agent handoff.
That file is gitignored; the tracked one is `AGENTS.md`. `4f1408d` fixed this
class of reference elsewhere and missed this instance.

## `e8cba27` — docs: correct the server README's deployment gates

The worst contradiction found. "External gates" said "No Supabase or Render
resource is created by this repository. Deployment waits for the owner to
choose and fund the plans, database and API regions..." — sitting below a
"Deploying" section that documents the live Lambda, the live HTTP API, and the
command that creates them.

Render is not a host this project uses. D28 lists it only as a rejected
alternative. The section now says what exists (a Supabase project with the
migrated schema; AWS resources that `deploy-lambda.sh` creates) and what is
genuinely still open: plans and funding, the 10-execution concurrency cap,
retention and availability, a verified SMTP sending domain, and the three Auth
settings `check-provider` cannot reach without a Management API token.

"Provider-free" also came out of the opening paragraph. It stopped being
accurate once the server required the Supabase identity configuration it lists
further down the same file.

## `3df85d6` — ci: move the workflow actions off the deprecated Node 20 runtime

Found by reading the CI run rather than the repo. Every run carried an
annotation: `actions/checkout@v4` and `actions/setup-node@v4` target Node.js 20
and are being forced onto Node 24. Both actions are at v7 now.

This workflow uses them plainly — no inputs on `checkout`, and `setup-node`
only pins `node-version` — so there was nothing in the major bumps to trip
over. Verified by the run the commit produced: 14 steps green and the
annotation gone, rather than by reading two changelogs and assuming.

## Adversarial verification

A passing suite is not evidence the suite works. Seven deliberate mutations
were applied to temporary copies, each confirmed present with `git diff` before
the check ran, and each reverted afterward:

| Mutation | Check | Result |
|---|---|---|
| `Math.round` to `Math.floor` in `totals.ts` | `totals.test.ts` | fails |
| Dropped a `CHECK` on `hourly_rate_cents` | `test-schema.sh` | fails |
| Appended `DROP TABLE sync_outbox` to `5-to-6.sql` | `test-migration.sh` | fails |
| Repointed a README link at a missing file | `check-docs.sh` | fails |
| `readDate` in `contracts/syncFormat.ts` accepts anything | server suite | fails (3) |
| Disabled the backup schema-version guard | `backup.test.ts` | fails |
| Reversed parent-first order in `applyRemoteChanges` | `sync.test.ts` | fails (3) |

The date-validator mutation is the one worth keeping. `readDate` is the guard
that the D26 cross-boundary defect produced, and breaking it now fails the
server suite — which is the check `4918b8d` added precisely so the real
serializer meets the real decoder. The lesson from phase 27 holds.

Two earlier attempts recorded a surviving mutant and were both wrong, for
reasons worth writing down:

1. A regex targeting `isCalendarDate` matched nothing — no such function
   exists. The check "passed" because the file was never edited.
2. Reordering `remoteEntityGroups` changed nothing, because that helper only
   feeds the dirty-row and validation scans, which are order-independent. The
   real write order is hardcoded further down `applyRemoteChanges`, and
   mutating *that* fails three tests.

Both were caught by insisting on a `git diff` that shows the mutation before
believing the result. A mutation test that silently does not mutate reports the
same "pass" as a test suite with no assertions.

## Tooling run

- `npx tsc --noEmit` — clean.
- `npx expo install --check` — dependencies up to date.
- `npx expo-doctor` — 20/20.
- `npx fallow dead-code` — no issues. `npx fallow dupes` — no duplication.
- `npx fallow health` — score 78 B, maintainability 92.5, 0 dead files, 0 dead
  exports, 0% duplication.
- `npm audit` — 11 moderate, all one advisory. `npm audit --prefix server` — 0.
- Clean clone into a scratch directory, `npm ci` both packages, `tsc`, then the
  full hook: exit 0.
- `expo export` for iOS and Android: both succeed. The clean clone also exports
  without a `.env`, which is correct — the public config is read at runtime, so
  a missing file is not a build failure.
- `./scripts/package-lambda.sh` builds a 1.1 MB zip. The staged layout was
  unpacked and `import('./server/src/syncContract.ts')` resolved, which is the
  specific thing the script's header comment warns would fail if the zip were
  flattened.

## Verified exceptions, not suppressions

Three declared dependencies are imported nowhere in `src/`: `expo-constants`,
`expo-linking`, and `react-native-screens`. All three are declared peer
dependencies of `expo-router`, which is why `expo install --check` and Doctor
both want them present and pinned. Fallow already treats them as reachable.
They are required, not dead.

`.fallowrc.json` still carries `ignoreDependencies: ["expo"]`. Removing it was
tested: Fallow then reports `expo` as a test-only production dependency,
because the app reaches it through `expo-router/entry` as `package.json`'s
`main` rather than through an import Fallow can see. The exception stays, and
it is now the only one in that file.

The `npm audit` finding is a single advisory — a missing buffer bounds check in
`uuid` v3/v5/v6 — reached through Expo's build-time chain. The only fix npm
offers is `expo@46.0.21`, an eleven-major-version downgrade of an SDK 57 app.
It was not applied. This is the same conclusion phase 18 reached; the advisory
has changed identity but not character. It is build-time tooling, not shipped
app code.

## What this proves, and what it does not

Every claim corrected here was checked against the repository, not against
memory. Every check was proven to fail on broken input before its passing
result was trusted.

None of this is device evidence. No build exists, nothing has run on hardware,
and the deployed API was not exercised — `deploy-lambda.sh` was read and its
packaging half was run, but no deployment was performed from this session. The
native acceptance gate is exactly where phase 29 left it.
