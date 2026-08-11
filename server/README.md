# Deferred backend

The iOS launch build is local-only and does not use this directory. The
Node/Express/Postgres account and sync experiment is retained as historical
work, but it is not deployed, tested by the root commit hook, or required for
the App Store release.

Do not add mobile configuration or store claims for this backend until a
future product decision restores account or cross-device requirements. If that
happens, choose one simple host first and revalidate authentication, privacy,
deletion, backups, and migrations before deployment.
