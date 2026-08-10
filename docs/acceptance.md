# Native acceptance pass

Everything in this app has been verified statically or against a simulator.
This is the list of things that can only be proven on a real device with a real
build. It is a gate, not a suggestion: nothing here is a code change, and
nothing above it in the roadmap counts as done until it passes.

Run it top to bottom. The order is dependency order, not importance order — a
failure early makes everything below it untrustworthy, so stop and fix rather
than pressing on.

Record the result inline: mark the box, and on a failure write what happened
next to it rather than in your head.

**Build under test**: iOS `preview` profile, first build, 2026-08-07.
The `preview` EAS environment is populated, so the cloud account should be
offered. If Manage data does not offer an account, the build is misconfigured —
that is the quiet-config trap in the roadmap, and it is a build problem, not a
test failure.

---

## 1. Local core

The app is fully usable with no account. This section is the floor: if it
fails, the cloud sections are meaningless.

- [x] **Cold-start persistence.** Log one shift, force-quit, reopen. The shift
      is still listed. *Passed 2026-08-07.*
- [x] **Create a job.** Current jobs shows it after a relaunch.
- [ ] **Log a shift against that job**, with tips and hours. Walk the flow:
      date, details, confirmation. The confirmation figures match what you
      entered, and the Trends totals and weekday chart both change.
      *Re-opened 2026-08-10: the flow replaced the inline form (D29).*
- [ ] **Advanced fields.** Log a shift using start and end times instead of
      typing hours. The stored duration matches the times, and the screen says
      how far apart the times are.
- [ ] **Hours longer than the times.** Enter 4:08 PM to 4:10 PM and 8 hours.
      Saving warns and offers both durations. Then enter times eight hours
      apart with 7.5 hours, an unpaid break: that saves 7.5 without a warning.
- [ ] **Job step.** With one job, Log a shift goes straight to the date screen.
      Add a second job and it asks which one first.
- [ ] **Back out.** Leave the flow part-way with the back gesture and the
      hardware back button. Nothing is written.
- [ ] **Overtime.** Log a shift long enough to cross the overtime threshold.
      Trends labels its figures as estimated and the gross reflects the
      overtime rate.
- [ ] **Calendar.** Open Calendar, pick a past date, confirm the shift list
      filters to it.
- [ ] **Row actions.** Edit a logged shift, then remove one. Both survive a
      relaunch. Editing opens the details screen directly with the date as a
      field. *Re-opened 2026-08-10: editing changed shape (D29).*
- [ ] **Trends.** Open Trends with at least three shifts logged. The chart
      renders and does not clip on this screen size.
- [ ] **Empty state.** A job with no shifts reads "No shifts yet." rather than
      a blank area or a crash.

## 2. Federal withholding

Local-only estimator. Nothing here is written to the server.

- [ ] **Save a W-4 setting**, then reopen the app. The setting persisted.
- [ ] **Estimate a paycheck.** The result shows filing status and pay period.
- [ ] **Out-of-year notice.** The shipped tables cover one tax year. Confirm
      the unsupported-year message appears rather than a wrong number, and that
      the save button is disabled in that state. If the device clock is inside
      the supported year, set the date forward to check this and set it back
      after.

## 3. Backup and restore

- [ ] **Full backup** produces a file the share sheet accepts.
- [ ] **Export CSV** opens the share sheet with a readable file.
- [ ] **Import CSV** of a file you just exported round-trips without
      duplicating or dropping rows.

## 4. Cloud account

The staging backend is live. Password recovery only reaches the owner's
mailbox — see the roadmap. Test recovery with your own address.

- [ ] **Manage data offers a cloud account.** If it does not, stop: the build
      shipped with an empty environment.
- [ ] **Create account** with a real address you control. Confirm the account
      exists on the next launch.
- [ ] **Sign out on this device**, then sign back in. Local shifts are still
      there while signed out.
- [ ] **Password recovery, end to end.** Forgot password → Send code → the
      six-digit code actually arrives → Set new password → sign in with it.
      This exercises three unverified provider settings at once: the template
      must contain the token, the OTP must be six digits, and the minimum
      password length must be at most 8. A failure here is most likely a
      dashboard setting, not app code.
- [ ] **Delete cloud account.** Confirm the account is gone and that local
      SQLite data is preserved — the two are deliberately separate.
- [ ] **Deletion pending path.** Immediately after a deletion, a retry should
      surface the `503 identity_deletion_pending` state as a readable message
      rather than a raw error.

## 5. Sync

- [ ] **Connect local data.** Shifts logged before signing in reach the server.
- [ ] **Sync now** on demand reports a status rather than hanging.
- [ ] **Offline relaunch.** Turn on airplane mode, log a shift, force-quit,
      reopen. The shift is present and the sync status says so honestly.
- [ ] **Interruption.** Start a sync and background the app mid-flight. On
      return it neither duplicates nor loses records.
- [ ] **Cross-device convergence.** Sign in on a second device, or reinstall.
      The shifts arrive.
- [ ] **Blocked records.** Force a conflict by editing the same shift on two
      devices while offline. The blocked list names the record, and
      "Discard my change" resolves it. Keeping the local copy instead is
      deliberately unbuilt — confirm the UI does not pretend to offer it.

## 6. Accessibility

A separate gate over everything above, and the one most likely to be skipped.

- [ ] **VoiceOver (iOS).** Log a shift start to finish without looking at the
      screen. Every control announces a label; nothing is an unnamed button.
- [ ] **TalkBack (Android).** Same pass on the Android build.
- [ ] **Dynamic Type.** Raise the system text size to a large setting. No
      screen clips its labels or loses a button off the bottom.

## 7. Before anyone else installs this

Not device tests — but they gate handing a build to a second person, so they
live here rather than getting lost.

- [ ] Rate limiter no longer counts in one process's memory. Lambda runs
      concurrent environments, so it currently bounds each instance rather than
      each caller.
- [ ] A verified Resend domain and a real sender. Today every recipient who is
      not the owner gets a recovery email that silently never arrives.
- [ ] `TRUST_PROXY_HOPS` confirmed against a request log that actually records
      a client address.
