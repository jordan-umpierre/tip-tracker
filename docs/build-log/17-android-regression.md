# Build log — Android regression

This phase rechecks the physical-iPhone work on Android before the overtime
calculator adds another layer of behavior.

## `f57e776` — fix: enlarge weekday shift counts (2026-08-04)

Imported the verified 845-shift CSV into the API 36 ARM64 emulator and opened
the weekday breakdown. The sample counts beneath the seven bars were almost
unreadable: they started at 10sp and `adjustsFontSizeToFit` could shrink them to
75% of that size.

Removed automatic shrinking and rendered the existing two-line count at 13sp,
semibold, with a darker secondary color and enough fixed height to preserve a
shared bar baseline. The existing accessibility label still announces each
weekday's rate, shift count, and hours.

The live emulator showed all seven captions clearly, including three-digit
counts, with no clipping or runtime errors. TypeScript, the trends assertion,
the full tracked hook, and the Fallow changed-file audit passed.

## `00bac2c` — fix: use Android time picker dialog API (2026-08-04)

The mounted Android picker still used the package's deprecated `onChange`
callback. Replaced that Android path with its documented imperative dialog API
and `onValueChange`; iOS keeps its inline spinner and Done button with the same
current callback.

On the API 36 emulator, cancel left the start field blank, selecting start and
end populated the correct fields, and each dialog stayed closed after OK.
Logcat showed no datetime deprecation warning or runtime error. TypeScript, the
date and picker-cancel assertions, the full tracked hook, and the Fallow
changed-file audit passed.
