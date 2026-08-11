# Build log — standalone shift history

## `1d1dcf3` — feat: separate shift history workflow (2026-08-11)

Log income now presents Browse history as a secondary button instead of
rendering the browser and shift rows inline. The existing `/history` route now
owns a dedicated `HistoryScreen`, so opening history pushes a native stack
screen and returning uses the platform back action.

`ShiftList` now owns only the history browser and its rows. The obsolete
header, footer, keyboard, layout-nudge, and scroll-to-inline-form machinery was
deleted. Year and month choices remain newest-first, while shifts inside the
selected month are sorted from the earliest date to the latest. The pure
grouping check includes the requested August 1 through August 31 regression.

Verification: TypeScript, the shift-group check, the repository hook, iOS
bundle export, Fallow dead-code and duplication scans, and the changed-file
Fallow audit passed. Repository-wide Fallow health still reports inherited
complexity thresholds, reduced from 26 findings before this change to 25 after
the list cleanup.

Build 6 was already submitted before this commit. A later production build is
required before the new workflow can be accepted on TestFlight.

## `c8a5bcf` — fix: hide internal back labels (2026-08-11)

The root stack now uses Expo Router's minimal native back-button display mode.
This keeps the platform chevron and back gesture while preventing the hidden
`(tabs)` route-group name from appearing as user-facing text on Shift history,
Settings, or a logging step.

Verification: TypeScript, iOS bundle export, the repository hook, Fallow
dead-code and duplication scans, and the changed-file Fallow audit passed. No
local iOS Simulator was available through Xcode tools, so the visual result
remains an explicit acceptance check on the replacement build.

## `d210480` — refactor: remove duplicate history link (2026-08-11)

View income no longer repeats the View shift history button. Browse history
stays on Log income, which is now the single entry point to the standalone
history workflow. The removed button's three unused style rules were deleted
with it; the empty-state navigation back to Log income is unchanged.

Verification: TypeScript, iOS bundle export, the repository hook, Fallow
dead-code and duplication scans, and the changed-file Fallow audit passed.
