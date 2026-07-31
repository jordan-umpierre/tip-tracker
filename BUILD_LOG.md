# Build Log

Chronological, commit by commit. The test for this file: if the repo vanished
and only this doc survived, could you recreate it, in order, without guessing?
That's a different job from the other docs, so it stays separate:

- `DECISIONS.md` — *why* a choice was made, indexed by number, not in order.
- `BRAINSTORM.md` — the running Q&A and what's next.
- `BUILD_LOG.md` (this file) — *what happened, in what order, with enough
  command-level detail to redo it.*

Where a commit made a real technical decision, this file names it and points
at the `DECISIONS.md` entry (`see D1`) instead of restating the reasoning.

Every real commit gets an entry, in the same session it's made, per
`CLAUDE.md`'s cold-agent handoff steps. `check-docs.sh` warns if this file's
`Last updated` date goes stale while other tracked files are committed, the
same way it already does for `BRAINSTORM.md`.

This file is the index. The entries themselves archive by calendar month into
`docs/build-log/YYYY-MM.md`, same rule and same reason as `docs/brainstorm/`'s
Q&A archive: split by purpose, and a date is a boundary anyone can find without
guessing, unlike a numbered sequel file. New entries go in the current month's
file, not here.

- [July 2026](docs/build-log/2026-07.md) — every commit from the initial
  commit through an end-of-session staleness audit: product docs, the
  decision log split, doc staleness checks and their own bugs, the schema
  and its tests, the cold-agent handoff system, the Expo scaffold, wiring
  `schema.sql` into `expo-sqlite`, the jobs and shifts data-access layers,
  the full log-a-shift screen (create, list, delete, edit — all verified on
  a physical device), and the archive splits and stale-comment fixes that
  followed once the docs themselves needed the same discipline as the code.

Last updated: 2026-07-30
