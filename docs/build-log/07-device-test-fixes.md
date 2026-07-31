# Build log — fixes from the first real device test

Part of the [build log](README.md). Numbered by phase because this is the
one place chronology is the content.

Companion docs: [../decisions.md](../decisions.md) for the numbered decisions,
[../roadmap.md](../roadmap.md) for what is next, [../product.md](../product.md)
for product scope.

Covers: confirming Layer 0's totals on a physical iPhone, and the four defects
that only showed up once someone actually used the screen.

---

## `b904b18` — docs: record Layer 0 confirmed on device, and four defects found (2026-07-30)

Totals matched the predicted `8.6h` / `$42.75` / `$175.31` exactly, which
confirms D5's per-shift rounding and confirms `Intl.NumberFormat` works on
Hermes at React Native 0.86, so the `toFixed` fallback isn't needed.

The four defects went into the roadmap's `NEXT` in priority order. Worth
noting how each was found, since none of them was findable any other way:

| Defect | How it surfaced |
|---|---|
| Shifts logging against the UTC day | The date field defaulted to tomorrow, at 23:31 local |
| Hours shown as `7.583333333333333` | Opening a shift for editing |
| List cramped into the bottom strip | Looking at the screen |
| Keyboard could not be dismissed | Trying to type in the form |

`tsc`, three test suites, and a clean bundle all passed the whole time.

## `8295716` — docs: add D6, show edit-form hours at a precision that round-trips (2026-07-30)

Written before the fix, because the fix is a direct transcription of the
decision and the obvious version of it is wrong. See D6.

## `c48ef9a` — fix: log shifts against the local calendar day, not the UTC one (2026-07-30)

The one that mattered. `todayIsoDate()` was:

```ts
return new Date().toISOString().slice(0, 10);
```

`toISOString()` converts to UTC first. At 23:31 US Central on 2026-07-30 that
returns `"2026-07-31"`, so every evening shift west of Greenwich filed under
the following day. A bartender logging a Friday close would find it on
Saturday. This is precisely the failure `schema.sql`'s date-only convention was
written to prevent, and the comment above the function claimed it prevented it.

To recreate:

1. Create `src/lib/dates.ts` with `localDateString(date: Date): string`,
   building the string from `getFullYear()`, `getMonth() + 1`, and `getDate()`,
   each padded with `padStart(2, '0')`. Those getters read local time.
   `getMonth()` is zero-based, hence the `+ 1`.
2. It takes a `Date` rather than calling `new Date()` itself. That is the whole
   reason it can be tested — the clock stays in the component.
3. `LogShiftForm`'s `todayIsoDate()` becomes `localDateString(new Date())`.
4. Create `src/lib/dates.test.ts`. Every `Date` uses the multi-argument
   constructor, which interprets its arguments as **local** time, so the
   assertions hold in any timezone rather than passing only on the machine that
   wrote them. That matters more than usual when the bug is a timezone bug.
5. Five checks: the 23:31 regression, that the same local day yields the same
   string at 00:05 and 23:55, zero-padding, a zero-based-month case in
   December, and a leap day.
6. Change the pre-commit hook to loop over `src/lib/*.test.ts` rather than
   naming one file, so a new test file is picked up automatically.
7. Break it on purpose: put `toISOString().slice(0, 10)` back and confirm the
   first assertion fails with `'2026-07-31'` where `'2026-07-30'` was expected.

## `fb15a70` — fix: stop the edit form showing hours as a repeating decimal (2026-07-30)

To recreate:

1. Add `hoursInputValue(minutes)` and `moneyInputValue(cents)` to
   `src/lib/format.ts`, kept separate from `formatHours`/`formatCents` because
   they do a different job: those produce text a person only reads, these
   produce the starting contents of an editable field that gets converted back
   and saved.
2. `hoursInputValue` is `(minutes / 60).toFixed(2)` with trailing zeros
   stripped by `.replace(/\.?0+$/, '')`. Dropping trailing zeros cannot change
   a number's value, so it is safe; `7.5` reads better than `7.50` in an input.
3. `moneyInputValue` is `(cents / 100).toFixed(2)` and deliberately keeps its
   trailing zeros — a rate field reading `15.5` looks like an unfinished edit.
4. Replace all four raw divisions in `LogShiftForm`: the three `useState`
   initializers and the one inside `handleSelectJob`.
5. Create `src/lib/format.test.ts`. The core of it is a loop over every
   duration from 1 to 1440 minutes asserting
   `Math.round(parseFloat(hoursInputValue(m)) * 60) === m` — the exact
   conversion `handleSubmit` performs. That coupling is intentional: if the
   save path's conversion changes, this test has to change with it.
6. Break it on purpose, and this one is worth doing carefully because the
   tempting wrong fix looks so reasonable. Change `toFixed(2)` to `toFixed(1)`
   so the field matches the list's `7.6h`, and the suite fails on the very
   first iteration: `hoursInputValue(1)` gives `"0"`, which saves as zero
   minutes and violates a `CHECK` constraint. A 455-minute shift would have
   saved as 456.

## `5d36702` — feat: scroll the whole log-a-shift screen as one surface (2026-07-30)

To recreate:

1. Give `ShiftList` an optional `header?: ReactElement` prop, passed straight
   to `FlatList`'s `ListHeaderComponent`.
2. Move `LogShiftForm` and `ShiftTotals` in `App.tsx` into that prop.
3. **Pass an element, not a function.** `header={<LogShiftForm .../>}` is
   correct; `ListHeaderComponent={() => <LogShiftForm .../>}` creates a new
   component type on every render, so React unmounts and remounts the form
   each time — which loses focus and closes the keyboard on every keystroke.
   This is the classic FlatList header bug and it looks harmless.
4. Replace `ShiftList`'s early return for the empty case with
   `ListEmptyComponent`. Left as an early return, the component would bail out
   before rendering the header and take the entire form off screen for anyone
   who hasn't logged a shift — which is every user on first launch.

Why not a `ScrollView` wrapping everything: a `FlatList` inside a `ScrollView`
puts two scrollers in competition for one gesture, and the inner list loses
virtualization, which is the only reason to use a `FlatList` instead of
`shifts.map(...)`.

## `5a96c9e` — fix: let the keyboard be dismissed by tapping away or scrolling (2026-07-30)

Root cause was two things at once. The hours, tips and rate fields use
`keyboardType="decimal-pad"`, and iOS renders that pad with no return key. And
the form sat outside any scroll view, so there was no surface whose taps could
dismiss the keyboard. The only escape was tapping the date field — a normal
keyboard, so it has a return key — and pressing return there.

To recreate, on the `FlatList` in `ShiftList`:

1. `keyboardShouldPersistTaps="handled"` — a tap a child already handled keeps
   the keyboard up, any other tap dismisses it. The default, `"never"`, would
   dismiss on the first tap and swallow it, so pressing Log shift with the
   keyboard open would take two taps.
2. `keyboardDismissMode="on-drag"` — scrolling closes the keyboard, matching
   the rest of iOS.

Both only work because the previous commit made the screen a single scroller.
Ordering the two commits the other way round would have shipped a no-op.

## Device re-test — all four confirmed (2026-07-30)

Not a commit, but the event that closes this phase, and the reason the phase
exists: every fix above was verified on the same physical iPhone that surfaced
the defects.

Checked, in order:

1. Date field defaults to the local calendar day rather than tomorrow's.
2. Editing a shift shows `7.58` hours and `15.50` rate.
3. Saving that shift untouched left the list at `7.6h` and the totals at
   `$175.31` — the D6 round-trip holding in the app, not only in the test.
4. The screen scrolls as one surface, form included.
5. The keyboard dismisses on a tap into empty space and on a drag, and Log
   shift fires on the first tap with the keyboard open.

That closes MVP Layer 0. Every feature in its scope is built, covered by a
check, and verified on real hardware.
