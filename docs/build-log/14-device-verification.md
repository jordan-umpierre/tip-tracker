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

| Platform | Exception | Code reaching JS |
| --- | --- | --- |
| iOS | `FilePickingCancelledException` | `ERR_FILE_PICKING_CANCELLED` |
| Android | `PickerCancelledException` | `ERR_PICKER_CANCELLED` |

The codes are derived from the class names by `expo-modules-core` —
`errorCodeFromString` in `ios/Core/Exceptions/CodedError.swift`, and the same
inference documented in Kotlin's `CodedException.kt`.

`ExportCsvButton.tsx` now checks both codes and returns quietly on a cancel.
Real failures keep `console.error` and the alert, and the alert text is
unchanged: a genuine throw can come from the pick, the create, or the write,
so "no file was written" is still the only claim it can safely make.

The toast was dev-only and would never have reached a user. The reason to fix
it is that logging a deliberate user choice at error severity means every
cancel becomes a reported error the moment crash reporting exists, and the
failure mode there is learning to ignore your own error reports. D16 is revised
with the verified codes and the corrected reasoning; the superseded claim in
[13-interactive-dashboard.md](13-interactive-dashboard.md) is marked in place
rather than rewritten, since the log records what was believed at the time.

No test was added. A test here could only assert that two copied string
constants match themselves, which is not a check on anything. The real risk is
an Expo upgrade renaming a code, which no local assertion can see, so it is a
comment at the constant and a line in D16's revisit condition instead.

TypeScript clean, tracked hook green, 21 schema checks and all seven direct-run
test files passing.
