# Build log — gross totals

Part of the [build log](README.md). Numbered by phase because this is the
one place chronology is the content.

Companion docs: [../decisions.md](../decisions.md) for the numbered decisions,
[../roadmap.md](../roadmap.md) for what is next, [../product.md](../product.md)
for product scope.

Covers: the totals row — total hours, total tips, total gross pay — plus the
first pure-calculation module, its test, and the shared formatters that came
out of it. This is the last piece of MVP Layer 0's own scope.

---

## `b438a97` — docs: add D5, round wages per shift rather than per total (2026-07-30)

Written before the code that implements it, because the whole commit is one
decision and the code is a direct transcription of it.

A shift stores integer minutes and an integer `hourly_rate_cents`, so its wage
is `minutes * rate / 60` — which is usually not a whole number of cents. 455
minutes at $15.50/hr is 11754.166… cents. Something has to round, and the only
real question is where.

To recreate:

1. Append a `### D5` section to `DECISIONS.md`, same blockquote format as
   D1–D4: Decision / Alternatives / Why / Known cost / Revisit when.
2. The decision: round per shift, then sum the rounded values.
3. The load-bearing reason: the totals row sits directly above `ShiftList`, so
   anyone adding the rows up by hand has to land on the summary number.
   Rounding once at the end can miss by a cent or two. Two 30-minute shifts at
   $15.01/hr are the smallest case — 751 + 751 = 1502 per shift, versus 1501
   rounded once.
4. The second reason, which the alternative can't answer at all: rates are
   stored per shift on purpose, so once two shifts have different rates there
   is no single rate to sum hours against and multiply by once.
5. Rejected: a stored `wage_cents` column (derived data that can disagree with
   its own source after an edit, with no performance problem to justify it),
   and a decimal library (a dependency for something integer cents already
   solve).

`check-docs.sh` warns "D5 is defined but never referenced anywhere" on this
commit and the next few. That's the check working — it clears once this file
cites it.

## `9a46b59` — feat: add gross totals calculation (2026-07-30)

To recreate:

1. Create `totals.ts` exporting a `ShiftTotals` type
   (`minutes`, `tipsCents`, `grossCents` — all integers, no formatting) and
   `calculateTotals(shifts: Shift[]): ShiftTotals`.
2. Import the `Shift` type with `import type`, not a plain import. This is
   load-bearing, not style: it tells Node the module is never needed at
   runtime, so running the file doesn't try to load `shifts.ts` and, through
   it, `expo-sqlite` — which would fail outside the app.
3. The body is one `Array.prototype.reduce` over the shifts, with
   `{ minutes: 0, tipsCents: 0, grossCents: 0 }` as the starting value. That
   starting value is also why an empty array needs no special case.
4. Gross per shift is
   `shift.tips_cents + Math.round((shift.minutes * shift.hourly_rate_cents) / 60)`
   — per D5. Multiplication before division, so the arithmetic stays on
   integers as long as possible.
5. Create `totals.test.ts` and run it with `node totals.test.ts`. No test
   framework: Node runs TypeScript directly now, and `node:assert/strict` is
   standard library, so this costs zero dependencies.
6. Six assertions: empty array gives zeros; a shift that divides evenly;
   a shift that doesn't (455 min at $15.50 → 11754); the D5 case pinned
   explicitly (two 30-min shifts at $15.01 → 1502, not 1501); a mixed set at
   three different rates; and gross never below tips.
7. Node needs real file extensions in imports (`'./totals.ts'`), which
   TypeScript rejects by default — add `"allowImportingTsExtensions": true`
   to `tsconfig.json`. Legal here because `expo/tsconfig.base` already sets
   `noEmit`.
8. `npm install --save-dev @types/node`, then add `"types": ["node", "react"]`
   to `tsconfig.json` — without it `tsc` can't resolve `node:assert/strict`.
   Noted in the config as a tradeoff: app files can now see Node globals, so
   `tsc` wouldn't catch a stray `Buffer` in code that ships to a phone.
   A second tsconfig would fix that and isn't worth it at this size.
9. Add the test to `.githooks/pre-commit`, alongside `check-docs.sh` and
   `test-schema.sh`. No wrapper script — Node runs the file directly. The
   `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` flag silences Node's
   complaint about `package.json` having no `"type": "module"`; adding that
   field would break `metro.config.js`, which is CommonJS.
10. Then break it on purpose, per the project rule that a check never shown to
    fail is not a check: swap `Math.round` for `Math.floor` and confirm the
    D5 assertion fails with `1500 !== 1502` and exit code 1. Restore.

## `6ebb2fe` — refactor: extract shared money and duration formatters (2026-07-30)

`ShiftList` was already formatting cents inline in two places, and the totals
row needed the same thing next. Extracted at the point the third copy would
have been written rather than after.

To recreate:

1. Create `format.ts` with `formatCents(cents)` and `formatHours(minutes)`.
2. `formatCents` uses `Intl.NumberFormat('en-US', { style: 'currency',
   currency: 'USD' })` rather than `(cents / 100).toFixed(2)`. It's built into
   the JS engine, so no dependency, and it adds the thousands separator a
   totals row needs once someone has logged a year of shifts — `$48,250.00`
   rather than `$48250.00`.
3. Construct the formatter once at module load, not inside the function.
   Building a formatter is the expensive part; formatting with an existing one
   is cheap, and this runs for every row on every render.
4. `formatHours` stays `(minutes / 60).toFixed(1)` plus `h` — one decimal is
   enough to tell 7.5 hours from 7.6.
5. Replace the three inline conversions in `components/ShiftList.tsx` with
   calls to these. Note the `{' '}` needed where a JSX line break would
   otherwise swallow a space between two expressions.

## `ee119d0` — feat: show gross totals above the shift list (2026-07-30)

To recreate:

1. Create `components/ShiftTotals.tsx` taking `shifts: Shift[]` as its only
   prop, calling `calculateTotals(shifts)` and rendering three stats through a
   small local `Stat` component — not exported, since nothing outside the file
   needs it.
2. Taking the raw shifts rather than a pre-computed totals object is the
   deliberate part: it keeps `App.tsx` a wiring file with no arithmetic in it,
   while the math still lives outside the component in `totals.ts`, where it
   stays testable without rendering anything.
3. Render `<ShiftTotals shifts={shifts} />` in `App.tsx` directly above
   `<ShiftList />`. Both read the same array, which is what guarantees the
   rows add up to the summary — a separately fetched total could drift out of
   sync with the list under it.
4. `calculateTotals` runs on every render. Fine at this size — one pass over
   an array already in memory. `useMemo` is the fix if it ever measures slow,
   and measuring first beats guessing.
5. Verified with `npx tsc --noEmit` and a bundling `npx expo start` against a
   freshly started Metro: 803 modules, up exactly three from the 800-module
   baseline earlier the same day, no resolution errors.

One gotcha worth recording: a Metro instance left running from an earlier
verification held port 8081, and `npx expo start` in a non-interactive shell
can't answer its "use port 8082 instead?" prompt — it prints
`Skipping dev server` and exits 1. `lsof -ti:8081 | xargs kill -9` first.
