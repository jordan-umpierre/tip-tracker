# Build log — local-only iOS scope

## `253213f` — refactor: reduce launch scope to local iOS app (2026-08-11)

The first App Store release no longer initializes or displays account and sync
features. The Supabase client, mobile auth, sync transport, conflict UI, and
their tests were removed from the shipping app. The unused dependencies and
secure-storage plugin were removed as well.

The Lambda packaging and deployment scripts were removed. The existing server
directory is now explicitly deferred and is not a root release dependency. The
SQLite migration history remains unchanged so existing databases retain a safe
upgrade path; the launch app no longer reads the old sync state.

Current-facing README, product, roadmap, acceptance, privacy, and store
disclosure docs now describe the local-only iOS release. Android production,
cloud accounts, Postgres, and AWS are deferred.

Verification: repository hook, TypeScript, Expo Doctor 20/20, dependency check,
iOS bundle export, docs check, schema/migration/backup checks, Fallow dead-code
and duplication scans, changed-file Fallow audit, EAS production build 5, and
App Store Connect submission queued under ASC app `6800162471`.
