# Order of Operations archive — through July 2026

Archived out of `BRAINSTORM.md`'s Order of Operations section on 2026-07-30,
when that file passed the ~500 line split threshold — same rule as the Q&A
and build-log archives, applied here for the same reason: this section is
append-only and grows every session.

One difference from those other archives: the most recent entries and the
`NEXT:` line stay inline in `BRAINSTORM.md` rather than moving out entirely,
because the cold-agent handoff protocol in `CLAUDE.md` needs `NEXT:`
immediately visible without a click-through. This file holds entries 1
through 19 — everything through finishing the jobs/shifts data-access
layer, just before the log-a-shift screen's UI work began. `BRAINSTORM.md`
picks up at entry 20.

Companion docs: `../../BRAINSTORM.md` for the current Order of Operations
and the `NEXT:` line, `../../BUILD_LOG.md` for command-level detail on every
commit these entries summarize, `../../DECISIONS.md` for the numbered
decisions referenced below.

---

1. Created directory `tip-tracker`
2. Created `README.md`
3. `git init`, first commit, pushed to GitHub
4. Created `BRAINSTORM.md` — the file you're reading
5. Defined the problem, the differentiators, and what's out of scope
6. Split the feature set into MVP + three later layers
7. Decided architecture: local-first, SQLite on device, sync added later (D1)
8. Decided platform: Expo (React Native, TypeScript) (D2)
9. Data model written as `schema.sql` — `jobs` and `shifts`, checked by hand
   against sqlite3
10. Split `DECISIONS.md` out of this file once it passed 750 lines, and added
    `scripts/check-docs.sh` plus a git pre-commit hook to stop docs rotting
11. First code review of the repo. `check-docs.sh` turned out to print FAIL and
    exit 0, so nothing it found had ever blocked a commit; `schema.sql` still
    cited D1 in the wrong file; and the claim that constraints were tested had
    no tests behind it. Fixed all three, added `scripts/test-schema.sh`, gave
    shifts a tombstone (D4), rewrote `README.md`, archived this file's Q&A log
12. Installed `sqlite3` and DB Browser for SQLite (both via `winget`), since
    `test-schema.sh` had been silently skipping on this machine the whole time
    (`WARN sqlite3 not installed`). Verified the suite actually catches a
    broken constraint by loosening a `CHECK` and watching it fail, not just
    trusting the 19-checks-passed output. Found `core.hooksPath` wasn't
    actually set on this machine despite being documented as done, and
    re-ran it. Split the July Q&A archive again, this time by purpose, once
    it itself passed the ~500 line threshold
13. Built a cold-agent handoff system, since `CLAUDE.md`'s old "Start here"
    section (status + next task, restated) had already drifted from this
    file's Order of Operations once. Thinned `CLAUDE.md` down to a pointer at
    this section instead of a second copy, added an explicit handoff protocol
    (check `core.hooksPath` first, do the one `NEXT:` task, update this log
    before ending the session), and taught `check-docs.sh` two new warnings:
    `core.hooksPath` not actually set to `.githooks`, and this file's
    `Last updated` date being stale while other work is being committed. Both
    verified by triggering them on purpose before trusting them
14. Scaffolded the Expo app. `create-expo-app` refuses a non-empty directory,
    so it ran into a throwaway subdirectory and the result got moved up by
    hand instead. That meant `app.json`'s `name`/`slug` and `package.json`'s
    `name` came out as the throwaway directory's name — caught by
    `expo-doctor`, fixed to `tip-tracker`. Kept the project's real
    `CLAUDE.md` over Expo's generated stub, and merged Expo's `.gitignore`
    rules into the existing file rather than overwriting it, per the trap
    this file already had a note about. Verified with `tsc --noEmit`,
    `expo-doctor` (20/20), and an actual `CI=1 expo start` bundling and
    serving before committing
15. Added `BUILD_LOG.md`: a commit-by-commit log detailed enough to recreate
    the repo from scratch, separate from `DECISIONS.md` (why) and this file
    (Q&A / what's next). Backfilled all 18 commits so far. Gave it the same
    staleness check `check-docs.sh` already runs against this file's
    `Last updated` date, verified by breaking it on purpose first
16. Wired `schema.sql` into `expo-sqlite` (`db.ts`). Opens the connection,
    turns on `PRAGMA foreign_keys = ON`, then runs `schema.sql` — shipped as
    a bundled asset via `metro.config.js` rather than duplicated as a JS
    string, so `db.ts` and `test-schema.sh` always run the same source of
    truth. Guarded against re-running the `CREATE TABLE` statements on every
    launch with `PRAGMA user_version`, since `schema.sql` deliberately has no
    `IF NOT EXISTS`. `App.tsx` temporarily renders the open/fail status to
    prove it end to end; that gets replaced once there's a real screen.
    Confirmed working for real on a physical iPhone — "database ready"
    rendered, meaning the schema actually loaded and ran on device. Getting
    there needed a detour: the App Store's Expo Go build was still on SDK 54
    while this project is on SDK 57 (Apple's review lag on Expo Go itself, a
    real and current gap, not a local issue). Fixed with `npx eas-cli@latest
    go`, which builds a custom Expo Go matched to our SDK and ships it via a
    personal TestFlight team — needs an Apple Developer Program membership,
    and the App Store Connect API key it generates needs the **Admin** role,
    not App Manager, since only Admin can manage the certificates EAS needs
    to sign the build
17. Revisited "screen sketches next" before starting it: this app has no
    server backend at all in MVP (D1), so "build the backend first" doesn't
    apply the normal way. What a screen actually needs first is a small
    data-access layer — plain functions wrapping SQL — since `db.ts` alone
    can open a connection and run `schema.sql` but can't insert or list
    anything yet. Reordered to: data-access functions per table, then the
    screen that calls them, one vertical slice at a time, rather than all
    screens first or (nonexistent) "all backend" first
18. Wrote `jobs.ts`: `createJob` and `listActiveJobs`, the first of that
    data-access layer, using `expo-crypto`'s `Crypto.randomUUID()` for ids.
    First pass at `listActiveJobs` copied `createJob` almost verbatim instead
    of adapting it — still an `INSERT`, still generating a new id and
    timestamp, wrong params, wrong return type. Rewritten to actually read:
    `db.getAllAsync<Job>(...)` instead of `db.runAsync(...)`, filtering
    `archived_at IS NULL` per D3. Verified with `tsc --noEmit`; not wired into
    a screen yet, so nothing to run on device for this one
19. Wrote `shifts.ts`: `createShift` and `listShifts`, same pattern as
    `jobs.ts`. `hourlyRateCents` is a required argument rather than looked up
    from the job inside the function — `schema.sql` is explicit that the
    column copies the job's rate at the moment of the shift, not a live
    reference, so the caller decides the value (default it to the job's
    current rate, let the user override it). `listShifts` takes no filter
    arguments for now, returns every non-deleted shift most recent first,
    and leaves grouping to the caller — add a filtered variant once a screen
    actually needs one. Verified with `tsc --noEmit`
