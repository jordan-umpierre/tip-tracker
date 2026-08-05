# Build log — Overtime

## `330876a` — feat: store overtime timing inputs (2026-08-04)

Schema version 3 adds optional local `start_time` and `end_time` values to
shifts, plus opt-in overtime and workweek boundary settings to jobs. D18 records
why duration remains authoritative and why existing shifts keep null times.

The migration runner previously applied one migration file and then stamped the
newest schema version. That stopped being safe once version 3 created a second
hop: a version-1 database would receive only `1-to-2.sql` and still be marked
version 3. It now applies each pending migration in order inside one transaction.

The schema suite passes 36 checks. The migration suite covers preservation,
rollback, a complete version-1-to-3 chain, and resolved column-order and trigger
parity between fresh and migrated databases. Comparing stored DDL text was
rejected because SQLite preserves source text differently for a fresh table and
columns added with `ALTER TABLE`.

The final gate ran on a physical iPhone with the real version-2 database. All
845 shifts migrated, the app opened, and its five year totals remained
133 / 227 / 162 / 223 / 100.

## `7e917f4` — feat: expose overtime fields in data layer (2026-08-04)

The existing `Job` and `Shift` row types and their explicit `SELECT` lists now
include the version-3 columns. Shift creation and editing accept optional times;
both default to null so the unchanged form keeps its existing behavior until
the next commit adds inputs.

An overtime-settings update function was written and then removed before the
commit because it had no caller until the later Manage UI step. Fallow caught
the dead export. Adding it beside its first caller keeps this layer from owning
an API based only on a future screen.

## `bbc4046` — feat: add native shift time picker (2026-08-04)

The first text-field version exposed SQLite's 24-hour storage format and made
the user repeat hours and tips. Device testing rejected it: `9` to `5` became a
20-hour shift, blank tips were treated as invalid, and editing a time left the
old derived hours in charge.

The replacement uses `@react-native-community/datetimepicker`, installed at
Expo SDK 57's compatible version. iPhone gets the native AM/PM spinner. Both
times with blank hours derive elapsed duration, including an overnight wrap;
an hours value the user edits still wins for unpaid breaks. Blank tips store
zero. Changing a time clears an untouched hours value, and optional times can
be cleared together.

TypeScript, 23 date/time assertions, the full hook, and Fallow's changed-file
audit pass. The complete flow passed on a physical iPhone. The package also
backs Android with its native time-picker dialog, but Android remains deferred
and unverified; its maintainers recommend the imperative dialog API there.

## `74ea74d` — feat: calculate overtime by configured workweek (2026-08-04)

The pure calculator filters one job's shifts, sorts them chronologically, and
tracks paid seconds inside each configured 168-hour workweek. Seconds after 40
hours receive the extra half of that shift's stored rate; straight-time gross
still comes from the existing D5 calculator, so disabled overtime produces the
same totals as before.

Clock times place a shift against a non-midnight boundary while stored duration
remains authoritative. A shift spanning the boundary divides its paid seconds
in proportion to the elapsed clock span and preserves the rounded remainder.
Untimed history stays wholly on its logged date under D18's documented midnight
approximation.

The direct Node assertion covers disabled and empty inputs, input order, job
filtering, the 40-hour threshold inside a shift, weekly reset, a custom
Wednesday 6am boundary, breaks across that boundary, untimed history, and an
invalid date. TypeScript, the full tracked hook, and Fallow's changed-file audit
pass. Varying-rate regular-pay and tip-credit rules remain outside D14's bounded
estimate; the calculator is not connected to displayed totals until step 5.
