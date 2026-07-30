# tip-tracker

A mobile app for service workers to log shifts and see what they actually take
home, not what they grossed.

Tipped income is irregular and mostly invisible until tax time. Cash tips make
it worse, because nothing withholds tax from cash. This app answers three
questions the existing options mostly ignore: what do I really make per hour,
which shifts are worth taking, and what will I owe in April.

Built for both W2 and 1099 workers. iOS and Android.

## Status

**Pre-code.** There is no app yet. What exists is the data model and the
reasoning behind every decision made so far.

That is deliberate rather than slow. The next commit scaffolds the Expo app, and
by then the storage model, the delete semantics, and the platform choice are all
settled and written down instead of being discovered halfway through.

Done:

- Product definition and MVP scope
- Architecture decided: local-first, SQLite on device, sync added later
- Platform decided: Expo, with the escape hatch understood
- [`schema.sql`](schema.sql) — the `jobs` and `shifts` tables, with tests
  confirming every constraint rejects bad data

Next:

- Scaffold the Expo app
- Wire the schema into `expo-sqlite`
- Build the log-a-shift flow

## Stack

| Piece | Choice | Why |
|---|---|---|
| Language | TypeScript | |
| UI | React Native | One codebase, reuses React |
| Tooling | Expo | [D2](DECISIONS.md) — `expo prebuild` is a real escape hatch |
| Storage | SQLite via `expo-sqlite` | [D1](DECISIONS.md) — logging a shift has to work with no signal |
| Backend | None in MVP | [D1](DECISIONS.md) — Node, Express and Postgres arrive with optional sign-in |

Every one of these is written up with its rejected alternatives in
[DECISIONS.md](DECISIONS.md). The alternatives stay in the file permanently; a
decision with no visible alternatives is an assumption.

## Data model

Full commentary lives in [`schema.sql`](schema.sql). The conventions worth
knowing before reading it:

- **Money is integer cents.** `$24.50` is `2450`. Never floats — the rounding
  error compounds across hundreds of shifts and a tax calculation.
- **Durations are integer minutes.** 7.5 hours is `450`.
- **Units go in the column name.** `hourly_rate_cents`, not `hourly_rate`.
- **IDs are text UUIDs**, so rows created on two devices cannot collide once
  sync exists.
- **Calendar days are date-only ISO 8601**, so a late shift never displays on
  the wrong day.
- **Anything describing a past event stores its own values.** A shift keeps the
  rate it was worked at, so a raise cannot rewrite last year's earnings.
- **Nothing is hard-deleted.** Jobs archive, shifts get a tombstone. A row that
  is truly gone is invisible to a device that never saw it.

## Repo layout

```
BRAINSTORM.md         product thinking, open questions, learning log
DECISIONS.md          numbered decisions with their rejected alternatives
BUILD_LOG.md          commit-by-commit history, detailed enough to recreate
schema.sql            the data model
docs/brainstorm/      archived Q&A log, one file per month
scripts/              the checks below
.githooks/            pre-commit hook that runs them
```

## Checks

Two scripts, both run by the pre-commit hook:

```sh
./scripts/check-docs.sh    # duplicate headings, dead references, broken links
./scripts/test-schema.sh   # every constraint in schema.sql rejects bad data
```

A fresh clone needs this once, because git does not look in `.githooks/` on its
own:

```sh
git config core.hooksPath .githooks
```

The doc checks exist because two stale-documentation bugs were committed on the
same day, both from appending to a long file without re-reading it. The rule
they enforce: a convention nobody checks is a convention that quietly stops
being true.

## Scope

MVP is logging shifts and viewing them. Trends, net-income projection and 1099
support are later layers, planned in [BRAINSTORM.md](BRAINSTORM.md) and
deliberately not built ahead of time.

Tax projections are the highest-risk part of this product, because real people
make real financial decisions on them. They will ship as estimates and never as
advice, with the inputs visible and the math conservative by default.
