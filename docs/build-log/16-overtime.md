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

## `0097a76` — feat: add per-job overtime settings (2026-08-04)

Manage data now gives each active job its own opt-in overtime control and fixed
workweek boundary. The UI uses the native Switch, seven weekday choices, and
the same platform time-picker API already proven by shift entry. Disabling an
estimate preserves the saved boundary so re-enabling it cannot silently reset
the employer's real workweek.

The copy bounds the feature before the adjusted number is connected: 40 hours,
1.5x, untimed shifts placed wholly on their logged date, and no tipped-credit
or other overtime rules yet. Saving updates all three job settings and
`updated_at` in one parameter-bound SQLite statement; archived jobs cannot be
changed through this active-job screen.

The full tracked hook, TypeScript, Expo dependency check, Expo Doctor 20/20,
Fallow's changed-file/dead-code/duplication gates, and fresh web, iOS, and
Android exports pass. The new Switch, weekday choices, picker, persistence,
and accessibility announcements still need native runtime verification.

## `5642874` — feat: show overtime-adjusted gross estimates (2026-08-04)

One pure overlay now starts every shift on its recorded D5 gross, then replaces
known jobs with the configured-workweek calculator's result. Running that
calculator independently for each job prevents two employers from sharing a
40-hour threshold; a missing job safely stays on recorded gross. Neither the
shift row nor SQLite stores an estimate.

Log rows and year/month/week groups use the overlay. Trends uses the same map
for its graph, range headline, per-hour and per-week summaries, and weekday,
month, and year breakdowns. Individual rows are estimated only for configured
jobs; a mixed group or All jobs scope is estimated when any included job is
configured. Visible and accessibility labels say so, and affected scopes warn
that untimed shifts count wholly on their logged date.

The direct assertions cover separate-employer thresholds, missing-job fallback,
mixed and selected scope labels, group totals, Trends/chart propagation, and
the export boundary. A 41-hour shift displayed as a $415 overtime estimate at
$10/hour still exports its recorded $410 gross. The full tracked hook,
TypeScript, Expo dependency check, Expo Doctor 20/20, Fallow's changed-file,
dead-code, and duplication gates, and fresh web, iOS, and Android exports pass.
Native display and accessibility verification remain open.

## `4173c44` — feat: import shift times from CSV (2026-08-04)

The existing nine-column adapter now preserves paired Start Time and End Time
values. Blank or case-insensitive `no data` pairs remain null; otherwise both
fields must use `h:mm AM/PM` with an optional leading zero. Accepted values are
normalized to stored `HH:MM`, shown in the preview, included in exact-duplicate
comparison, and written inside the existing exclusive transaction.

Direct assertions cover midnight, noon, overnight shifts, letter case, leading
zeroes, one-sided values, malformed values, and the invalid-file gate that
offers no import transaction when any row fails. The full tracked hook,
TypeScript, Expo dependency check, Expo Doctor 20/20, Fallow's changed-file,
dead-code, and duplication gates, and fresh web, iOS, and Android exports pass.
This proves the synthetic contract, not a real timed Breadmaker file: the
supplied export contains only `no data` in both time columns. Native import and
preview verification for a timed file remains open.

## `3a80cac` — feat: include shift times in CSV exports (2026-08-04)

`Start Time` and `End Time` now follow `Note`, leaving every established CSV
column in place. Timed rows emit the canonical stored `HH:MM` values; untimed
history emits two blanks, including for older migrated rows. Overnight shifts
remain an ordinary pair such as `21:00,05:00` because the date and duration
already carry the rest of the record.

The export assertions cover daytime, untimed, and overnight rows while keeping
oldest-first/id-tiebreak ordering, exact duration seconds, RFC 4180 escaping,
and the recorded-pay boundary. A 41-hour shift at $10/hour still exports D5's
recorded `$410.00`, never the `$415.00` overtime estimate shown on screen.

The full tracked hook, TypeScript, Expo dependency check, Expo Doctor 20/20,
Fallow's changed-file/dead-code/duplication gates, and fresh web, iOS, and
Android exports pass. This closes the automated overtime scope. Creating and
inspecting a timed export on native hardware, exercising the timed import
preview, verifying the overtime settings and labels, and VoiceOver/TalkBack
remain manual evidence gates.
