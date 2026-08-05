# Server sync API

This phase implements only the provider-free server half of sync. It adds no
mobile authentication, HTTP client, retry scheduler, provider resource, or
deployment claim. D24 is the wire and conflict contract.

## `7629f05` — docs: define server sync contract (2026-08-05)

Recorded one mutation per request, strict entity records, optimistic base
versions, explicit conflicts, separate client/server timestamps, paged pulls,
no guessed deduplication, and the 10,500,000-byte mutation ceiling.

## `3dce9d6` and `1bc12a9` — add and correct migration 002 (2026-08-05)

Migration 002 adds client timestamps to every domain table, account-scoped
change indexes, and durable stored responses. Before any endpoint or hosted
database existed, review caught that account plus local sequence collides when
two devices both begin at one. The corrected key is account, canonical device
UUID, and operation id. Real PostgreSQL proves migration rollback, checksum
tracking, idempotent rerun, two-device sequence reuse, same-device uniqueness,
and account cascade.

## `eafcc45` — feat: add idempotent sync mutations (2026-08-05)

`POST /v1/sync/mutations` validates one exact job, shift, or federal-setting
record after JWT verification. The token subject alone selects ownership.
Creates require no existing row; updates and synced deletes require the exact
base server version. Successes and expected conflicts commit with their request
checksum, so an uncertain retry returns the exact original response.

Real PostgreSQL and a locally served JWKS prove tenant isolation, body spoof
rejection, all entities, two equal-looking shifts, multi-device replay, changed
checksum rejection, stale-version and duplicate-setting conflicts, archives,
tombstones, malformed fields, a legitimate record above 32 KiB, the explicit
sync ceiling, and rollback of both the domain write and replay record.

## `38256bd` — feat: add incremental sync pull (2026-08-05)

`GET /v1/sync/changes` strictly validates its required cursor and bounded page
size. One account-filtered `UNION ALL` reads jobs, shifts, and settings in
change-sequence order; one extra row supplies `hasMore`, and `nextCursor` is the
last emitted sequence. Tests prove pagination, empty/exhausted pages, archive
and tombstone delivery, preserved client timestamps, ordering, malformed query
rejection, and tenant isolation.

## Verification boundary

The full repository hook and all eleven server tests pass. Fallow reports no
server health finding or duplicate and no server dead-code issue. This proves
the local HTTP/PostgreSQL/JWT contracts, not Supabase email delivery, hosted
JWKS, physical-device networking, retry behavior, deployment, retention,
backups, or cross-device operation against real provider resources.
