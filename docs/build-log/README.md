# Build log

Chronological, commit by commit. The test for these files: if the repo vanished
and only this directory survived, could you recreate it, in order, without
guessing?

That's a different job from the other docs, so it stays separate:

- [../decisions.md](../decisions.md) — *why* a choice was made, indexed by
  number, not in order.
- [../roadmap.md](../roadmap.md) — what's next, and a session-level summary of
  what's done.
- **This directory** — *what happened, in what order, with enough
  command-level detail to redo it.*

Where a commit made a real technical decision, these files name it and point at
the decision number (`see D1`) instead of restating the reasoning.

## What gets an entry

Commits that change the app, the schema, the checks, or a decision — in the
same session they're made.

Commits that only write *these files* don't get their own entry, and never
have. A doc commit whose whole content is "record what the last commit did"
would have to describe itself, and its hash can't exist until after it's
written. The normal shape is a code commit followed by the doc commit that logs
it; the second one is bookkeeping for the first, not a separate event.

This is written down because the rule used to read "every real commit gets an
entry," which was never true — roughly fifteen doc commits across this repo's
history quietly didn't have one. A rule nobody follows is worse than a narrower
rule that's honest, since the first kind rots without anyone noticing.

Not automated on purpose: deciding whether a commit is "real work" or
bookkeeping needs a judgment a script can't make, and a check that guessed
would either nag constantly or pass while missing things.

Last updated: 2026-07-31

---

## Phases

Numbered because this is the one place chronology is the content, so ordering
matters more than alphabetical browsing. Each file still carries a descriptive
name — the number adds sequence without costing you the description.

1. [01-docs-and-process.md](01-docs-and-process.md) — the initial commit
   through the cold-agent handoff system: product docs, the decision log split,
   `check-docs.sh` and its own real bugs, `test-schema.sh`, the README rewrite.
2. [02-app-and-sqlite.md](02-app-and-sqlite.md) — scaffolding the Expo app,
   adding this build log, wiring `schema.sql` into `expo-sqlite`.
3. [03-data-layer.md](03-data-layer.md) — `jobs.ts` and `shifts.ts`, the
   data-access functions a screen actually calls.
4. [04-log-shift-screen.md](04-log-shift-screen.md) — the first hand-written
   React Native UI: create, list, delete, and edit a shift.
5. [05-gross-totals.md](05-gross-totals.md) — the totals row, the first
   pure-calculation module and its test, the money rounding rule (D5), and the
   shared formatters. Completes MVP Layer 0.
6. [06-restructure.md](06-restructure.md) — moving application code into
   `src/` and reorganizing the docs by the question each one answers.
7. [07-device-test-fixes.md](07-device-test-fixes.md) — confirming totals on a
   real iPhone, and the four defects that only a real screen could surface:
   the UTC date bug, the repeating-decimal edit field, the cramped layout, and
   the trapped keyboard.
