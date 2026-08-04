# Build log — Device verification of the 2026-08-03 UI session

The previous session shipped roughly fifteen behavior changes across both tabs
and verified none of them on hardware. Every item was a layout, gesture, or
filesystem behavior that no assertion in this repo can reach, so the roadmap
held new work until a physical device had confirmed them. This phase is that
pass, and what it found.

## Export verified end to end (2026-08-04)

No commit — this is the verification itself, and the defect it exposed is the
commit below.

Ran the export on a physical iPhone: tapped Export shifts as CSV in Manage data,
picked a location, and got a file. That is the first time
`Directory.pickDirectoryAsync`, `createFile`, and `write` have ever executed;
until now only `buildShiftExportCsv` was covered, and it is the pure half.

The file checked out against D16's format. Header row as specified, 845 data
rows, dates ascending from 2022-06-29 to 2026-08-03, money as plain decimals a
spreadsheet reads as numbers. Per-year counts — 100, 223, 162, 227, 133 — match
the year rows the Log tab renders from its own grouping code, so the export and
the on-screen tree agree.

Two rows are worth keeping as evidence. `2025-06-20` is the only row at a
`7.50` hourly rate rather than `9.00`, which is the "history stores its own
values" convention holding: a rate change did not rewrite an old shift. It also
lands on D5's rounding rule, 5.43h x $7.50 = $40.725 written as `40.73`.
`2025-02-17` carries tips of `0.28` and round-trips exactly.

One observation that is not a defect: every `Duration Seconds` value in the
export is a multiple of 36. The whole dataset arrived through D13's importer at
two-decimal-hour granularity, so for this data the lossless column carries
nothing the `Hours` column does not. It starts mattering the first time a shift
is logged in the app rather than imported.

Two gaps in the data worth remembering when Trends is verified: December 2024
has no shifts at all, and 2024-05-20 through 2024-06-04 is nearly empty. Those
are the natural edge cases for any range window that divides by shift count.

## `4ee6317` — fix: treat a canceled export picker as a choice, not an error (2026-08-04)

Canceling the picker produced the correct "Nothing exported" alert, and a red
LogBox toast underneath it reading `Could not export shifts. Error: File
picki...`. The alert was right; the toast was the tell.

Reading `expo-file-system` 57 showed the premise behind that catch block was
false. Both platforms throw a dedicated exception when the user backs out:
`FilePickingCancelledException` on iOS, `PickerCancelledException` on Android.
`expo-modules-core` derives an error code from each class name —
`errorCodeFromString` in `ios/Core/Exceptions/CodedError.swift`, and the
matching inference in Kotlin's `CodedException.kt` — which produces
`ERR_FILE_PICKING_CANCELLED` and `ERR_PICKER_CANCELLED`.

So this commit checked those two codes and returned quietly on a cancel.
TypeScript clean, hook green, seven test files passing. On device it changed
nothing: the cancel still logged and still alerted.

## `0a980f0` — fix: detect a canceled export picker by message, not error code (2026-08-04)

The previous commit failed for exactly the reason the original code did — a
derivation read out of source instead of observed. A throwaway `console.log` of
the caught value in the catch block settled it in one tap:

```
EXPORT CATCH SHAPE {"code": undefined, "message": "File picking was cancelled
by the user", "name": "Error", "ownKeys": ["message", "stack"]}
```

The code does not survive the crossing into JavaScript. What arrives is a plain
`Error` with `message` and `stack` and nothing else, so the message is the only
signal there is. Both platforms share the phrase "was cancelled by the user"
(iOS: "File picking was cancelled by the user"; Android: "The file picker was
cancelled by the user"), and that is what the check now matches.

Doing nothing was reconsidered at this point, since the toast is dev-only. Two
facts ruled it out. `LogBox.js` patches `console.warn` alongside
`console.error`, so downgrading the severity recolors the toast instead of
removing it. And the alert is the only user-visible half, which cannot be
removed without telling cancel apart from failure. D16 carries the full
reasoning, including the one-directional failure mode that makes a string match
acceptable here.

The predicate moved to `src/lib/pickerCancel.ts` so it can be asserted
directly; importing the component would pull in React Native, which the
direct-run test files cannot load. `pickerCancel.test.ts` covers both real
platform messages, a write failure, a failure that merely mentions
cancellation, and the non-`Error` values a `catch (unknown)` can receive —
eight checks. It was verified by loosening the pattern to `/cancel/` on
purpose, which fails the fourth assertion. The hook's test loop is a `for`
rather than a pipe, so a failing file does propagate its status.

What no test covers is upstream rewording the message, which is recorded in
D16's revisit condition rather than pretended away.

TypeScript clean, tracked hook green, 21 schema checks and all eight direct-run
test files passing.
