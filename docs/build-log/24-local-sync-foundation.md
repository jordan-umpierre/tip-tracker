# Local sync foundation

This phase implements only the device-side facts that authenticated push/pull
will need. SQLite remains the source of truth. There is no mobile sign-in,
network route, retry scheduler, conflict UI, provider resource, or deployment
claim in this phase.

## `402988d` — docs: define local sync mutation tracking (2026-08-05)

Recorded D23 before changing the database. Every domain write is tracked by
SQLite triggers rather than companion calls that imports, restore, direct SQL,
or a future writer could forget. The decision also fixes the account-binding,
in-flight acknowledgement, remote suppression, bootstrap, backup, and
withholding-tombstone boundaries.

Verification:

```sh
./scripts/check-docs.sh
git diff --check
```

## `28057dd` — chore: separate server typechecking (2026-08-05)

The root Expo TypeScript configuration had included the isolated `server/`
package even though that package owns its own Node configuration. The two
environments augment `ProcessEnv` differently, so a root check could reject
server fixtures that the server's real check accepted. Excluding `server/`
from the Expo config makes each package responsible for its own runtime types.

Both boundaries pass independently:

```sh
npx tsc --noEmit
npm --prefix server run typecheck
```

## `d68c2e1` — feat: track local sync mutations (2026-08-05)

Schema version 5 adds one sync-state row, per-row server metadata, and a compact
dirty-row outbox. Job, shift, and federal-setting insert/update/delete triggers
replace a row's pending entry with a newer local sequence. A delayed push
acknowledgement deletes only the sequence it sent, so a later edit stays dirty.

The 4-to-5 migration queues every existing domain row, including archived jobs
and shift tombstones. Fresh databases start with no pending mutations. Federal
withholding settings gain `deleted_at`; active pay-date lookups hide those
tombstones while backup and later sync retain them.

The remote-apply helper binds one canonical account, rejects a different
subject, refuses to overwrite dirty local rows, writes jobs before their child
settings and shifts, records server versions and the pull cursor, and suppresses
outbox triggers only inside one exclusive transaction. A failure rolls back the
binding, rows, metadata, cursor, and suppression flag together. Push
acknowledgements never regress metadata when responses arrive out of order.

Backup format version 3/schema 5 preserves settings tombstones but excludes
the outbox, cursor, server versions, and account binding. Strict version-1/
schema-3 and version-2/schema-4 files normalize to the current in-memory shape.
Restore remains domain-empty-only; its inserts intentionally enqueue every
restored row, and a failed restore rolls those entries back with the data.

Verification:

```sh
git diff --check
npx tsc --noEmit
npm --prefix server run typecheck
./.githooks/pre-commit
```

The hook passes 63 schema checks, the complete 1-to-5 migration with v5
bootstrap and rollback, fresh-versus-migrated parity, backup restore rollback,
seven server tests, six real-SQLite sync tests, and every pure-library test. No
new dependency was added. Fallow's CLI was unavailable in this environment, so
no Fallow result is claimed for this phase.

## Still open

- Run the existing native withholding and isolated restore acceptance passes;
  automated SQLite fixtures do not prove the developer's real database upgrade.
- Choose the external Supabase, Render, SMTP, region, availability, retention,
  and budget gates recorded in D22.
- Add mobile email/password authentication only after the provider exists.
- Define and implement the authenticated HTTP push/pull, idempotency, retry,
  and conflict-resolution contracts. The local foundation does not guess them.
