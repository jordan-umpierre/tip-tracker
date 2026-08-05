# Mobile sync transport

## D26 — serialized foreground sync (2026-08-05)

D26 fixes the mobile transport boundary before implementation. Local writes
never wait for the network. One foreground or manual run pushes exact atomic
SQLite snapshots serially before pulling strict pages. Exact-body retry,
sequence-guarded acknowledgement, durable blocked responses, per-page cursor
commits, and account mismatch checks preserve D23 and D24 under interruption.

This provider-free unit uses injected authentication and fetch boundaries for
tests. It adds no provider resource, deployment, background task, network-status
dependency, conflict editor, or claim about native and cross-device behavior.

## Implementation units

All four shipped on 2026-08-05.

1. `972f034` added the atomic D24 mutation snapshot and durable
   remote-conflict storage.
2. `ff40764` added the injected authenticated push/pull transport and the
   serialized runner.
3. `00bdc91` triggered sync only after verified connection, explicit
   **Sync now**, and signed-in foreground entry, and showed bounded status in
   Manage data.
4. The complete repository, server, and transport gates pass. Staging,
   physical-device networking, and provider acceptance remain explicit.

## What the tests could not see

`4ecaeb1` fixed a defect that both test suites were structurally blind to.

`pg` parses a Postgres `date` column into a JavaScript `Date` at the server's
local midnight. `serializeRecord` then stringified it, so `shift_date` and
`effective_from` went out as `"Wed Aug 05 2026 00:00:00 GMT-0500"` instead of
`"2026-08-05"`. The client decoder accepts only `YYYY-MM-DD`, so every pulled
shift and withholding setting would have been rejected as malformed. Jobs have
no date column, so they would have synced fine and made the failure look
partial and confusing.

Neither side was careless. The server's pull assertions covered `createdAt`,
`archivedAt`, and `deletedAt`, which are all `timestamptz` and come back as
`Date` objects that serialize correctly. The transport tests drive a
hand-written fake `fetch`, so they assert the client against a fixture the
client's own authors wrote.

The lesson is about where the contract lives, not about missing coverage. It is
written twice, in `server/src/syncContract.ts` and `src/sync/wire.ts`, and
nothing forces the two definitions to meet. Every test passed while the feature
was broken end to end. One real round trip through both halves is worth more
here than more assertions on either side.

The fix reads the raw wire text rather than converting the `Date` back.
Converting would mean undoing timezone math that never needed to happen, and
`toISOString().slice(0, 10)` would silently shift the day by one for any server
running east of UTC.
