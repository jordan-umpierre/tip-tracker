# iOS acceptance pass

This is the final hands-on gate for the local-only App Store launch. Run it on
the signed iOS preview or production candidate build, not Expo Go.

**Build under test:** iOS 1.0.0 build 7, EAS build
`3c241984-17ff-4bd0-98db-b2b5461cea23`, commit `4fb1350`. Record the physical
device here before starting: iPhone 13 Pro Max

## Local core

- [x] Cold start, log one shift, force-quit, and reopen. The shift remains.
- [x] Create a second job. The job picker and inherited rate are correct.
- [x] Log a shift with date, hours, tips, and note. Confirmation and Trends
      show the values entered.
- [x] Edit a shift, delete a shift with confirmation, relaunch, and confirm
      both changes persist.
- [x] From Log income, open Browse history and confirm the header back button
      shows only the native icon, never an internal route name such as `(tabs)`.
      Use it to return. Select a month with shifts on different dates and
      confirm its rows run from the earliest date at the top to the latest at
      the bottom.
- [x] Log with start and end times. The stored duration and displayed warning
      are correct, including an overnight shift.
- [x] Enable overtime for one job. The result is labeled as an estimate and
      another job is unaffected.
- [x] Open Trends with several shifts. The chart, range controls, scrolling,
      and empty state work without clipping.
- [x] Use the native back gesture and hardware-equivalent navigation during a
      partially completed log. Nothing is written until save.

## Files and estimates

- [x] Export CSV and JSON backup. The share sheet accepts both files.
- [x] Import the exported CSV into a scratch job. Rows are not duplicated or
      dropped, and duration stays within the documented CSV precision.
- [x] Restore a JSON backup on an empty device or test installation. Jobs,
      shifts, and settings return with the same values.
- [x] Save and reopen a federal withholding setting. The output is labeled as
      a bounded estimate, not tax advice or a final tax result.

## Accessibility and release hygiene

- [ ] VoiceOver completes logging, editing, deletion, import/export, and
      backup without unnamed controls.
      Not verified: iPhone Mirroring does not expose the mirrored app's
      VoiceOver focus or spoken control names.
- [ ] Dynamic Type does not clip labels or hide actions.
      Failed on build 7: at the maximum accessibility text size, the CSV import
      explanation overlaps itself and nearby actions are clipped.
- [x] The app works in airplane mode because the launch app has no network
      dependency.
- [ ] Settings opens the public privacy policy and support pages in the browser.
      Failed on build 7: both rows show the `Link not opened` fallback instead
      of launching the browser. Both configured public URLs return HTTP 200.
- [ ] The App Store Connect privacy URL, support URL, App Privacy answers,
      screenshots, age rating, and app description match the local-only build.
      Incomplete: the pulled listing still uses `Tip Tracker (fa210b)` and does
      not include the localized description, URLs, or screenshots. The pulled
      age-rating answers are consistent with the app; App Privacy still needs
      confirmation in App Store Connect.

Android, cloud sync, accounts, server deployment, and AWS are intentionally
outside this acceptance pass.
