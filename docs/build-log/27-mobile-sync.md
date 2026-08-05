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

## Planned implementation units

1. Add the atomic D24 mutation snapshot and durable remote-conflict storage.
2. Add the injected authenticated push/pull transport and serialized runner.
3. Trigger sync only after verified connection, explicit **Sync now**, and
   signed-in foreground entry; show bounded status in Manage data.
4. Run the complete repository, Expo, export, and Fallow gates while keeping
   staging, physical-device networking, and provider acceptance explicit.
