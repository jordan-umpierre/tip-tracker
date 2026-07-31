# Build log — Expo scaffold and SQLite wiring

Part of the [build log](README.md). Numbered by phase because this is the
one place chronology is the content.

Companion docs: [../decisions.md](../decisions.md) for the numbered decisions,
[../roadmap.md](../roadmap.md) for what is next, [../product.md](../product.md)
for product scope.

Covers: scaffolding the Expo app, adding this build log itself, and wiring
`schema.sql` into `expo-sqlite` (the asset-bundling trick, the
`PRAGMA foreign_keys` gotcha, the `PRAGMA user_version` migration guard).

---

## `477c0e5b` — feat: scaffold Expo app with TypeScript template (2026-07-30)

First app code. To recreate:

1. `npx create-expo-app@latest . --template blank-typescript` refuses to run
   in a non-empty directory, and this repo already has `BRAINSTORM.md`,
   `schema.sql`, etc. in it. Workaround: scaffold into a throwaway
   subdirectory instead (`npx create-expo-app@latest .expo-scaffold-tmp
   --template blank-typescript`), then move every generated file up into the
   project root and delete the empty subdirectory.
2. The scaffold generates its own `CLAUDE.md` (a one-line stub) and its own
   `.gitignore`. Do not let either overwrite what's already here: keep the
   project's real `CLAUDE.md`, and merge the scaffold's `.gitignore` rules
   (`node_modules/`, `.expo/`, native build folders, etc.) into the existing
   file instead of replacing it — this exact trap was already flagged in a
   comment left in `.gitignore` by the `00e431b1` commit.
3. Because the app was generated inside a directory literally named
   `.expo-scaffold-tmp`, `app.json`'s `name`/`slug` and `package.json`'s
   `name` all came out as `.expo-scaffold-tmp` / `expo-scaffold-tmp`. Caught
   by running `npx expo-doctor`, which flagged the slug as invalid (slugs
   can't contain dots). Fixed both files to `tip-tracker`.
4. Verified before committing: `npx tsc --noEmit` (clean), `npx expo-doctor`
   (20/20 checks), and `CI=1 npx expo start` to confirm Metro actually
   bundles and serves on `localhost:8081` rather than just trusting the
   generated files looked right.

`node_modules/` is not committed — regenerate it with `npm install`.

## `38c8579` — docs: add BUILD_LOG.md, a commit-by-commit recreation log (2026-07-30)

This file. Backfilled entries for all 18 commits up to and including
`477c0e5b` by reading each commit's actual diff, not just its message. Added
check 8 to `check-docs.sh`, a copy of the existing `BRAINSTORM.md` staleness
check (warns if other files are staged while this file's `Last updated` date
isn't today), and tested it the same way every check in this repo gets
tested: set the date back on purpose, confirmed the warning fired, then set
it back before committing. Added a one-line pointer to this file in
`README.md`'s repo layout section.

## `ca02120` — docs: mark Expo scaffold and BUILD_LOG.md done, point NEXT at expo-sqlite (2026-07-30)

Caught immediately after the previous two commits: `BRAINSTORM.md`'s Order of
Operations still listed the Expo scaffold as `NEXT` even though it had
already shipped in `477c0e5b`, and the `BUILD_LOG.md` work itself hadn't been
logged there either. Marked both done and moved `NEXT` to wiring `schema.sql`
into `expo-sqlite` — the cold-agent handoff protocol in `CLAUDE.md` exists
specifically so this doesn't get missed at the end of a session.

## `8a13147` — feat: wire schema.sql into expo-sqlite (2026-07-30)

To recreate:

1. `npx expo install expo-sqlite expo-asset expo-file-system` — installs the
   SDK-compatible versions and registers the config plugins in `app.json`
   automatically.
2. Add `metro.config.js` with `config.resolver.assetExts.push('sql')`, so
   Metro treats `schema.sql` as a bundled asset instead of trying to parse it
   as JavaScript when it's `require`'d.
3. Write `db.ts`: `SQLite.openDatabaseAsync('tip-tracker.db')`, then
   `db.execAsync('PRAGMA foreign_keys = ON;')` — SQLite ignores foreign keys
   by default, per connection, not something saved in the database file
   itself; `schema.sql`'s own header comment already flags this.
4. Read `PRAGMA user_version` (defaults to `0`) to decide whether
   `schema.sql` has already been run against this database file. If not:
   load it via `Asset.fromModule(require('./schema.sql')).downloadAsync()`
   then `new File(asset.localUri).text()`, run it with `db.execAsync`, and
   set `PRAGMA user_version = 1`. The version guard exists because
   `schema.sql` has no `IF NOT EXISTS` on purpose, to keep it byte-identical
   to what `scripts/test-schema.sh` loads — so running it twice against the
   same file would throw on the second app launch without this guard.
5. `db.ts` caches the open connection in a module-level promise (`getDb()`),
   so every caller awaits the same connection instead of racing to open a
   second one — a second connection would need its own `PRAGMA foreign_keys`
   call, since that setting doesn't carry over.
6. Temporarily wired `App.tsx` to call `getDb()` on mount and render
   "database ready" or the error message, purely to prove the chain works
   end to end. Intended to be replaced once a real screen exists.

Verified with `tsc --noEmit` and `CI=1 npx expo start` followed by fetching
`http://localhost:8081/index.bundle?platform=android&dev=true` directly —
confirms Metro resolves every import and bundles cleanly (789 modules).

That bundling check doesn't prove the native SQLite calls actually run, and no
Android/iOS tooling was available in the agent's environment to check further.
Confirmed for real afterward on a physical iPhone: `App.tsx` rendered
"database ready", meaning `openDatabaseAsync`, both `PRAGMA` calls, the
`schema.sql` asset load, and `execAsync` against it all ran successfully on
device.

Getting Expo Go onto the phone needed its own detour, worth knowing about if
this happens again: the App Store's Expo Go build lags Expo's SDK releases by
Apple's review time, and was still stuck on SDK 54 while this project is on
SDK 57 — a real, current gap, not a local misconfiguration (Expo's own
changelogs confirm newer builds sit in App Store review for weeks). Fixed with
`npx eas-cli@latest go`, which builds a custom Expo Go matched to this
project's SDK and ships it to a personal TestFlight team under the Apple
Developer account being used. Requires an Apple Developer Program membership;
the App Store Connect API key EAS generates for this needs the **Admin**
role specifically, not the more restricted App Manager role — Apple only
exposes certificate/provisioning-profile management (which EAS needs to sign
the build) to Admin over the API.

