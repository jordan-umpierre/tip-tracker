# Build log — repo restructure

Part of the [build log](README.md). Numbered by phase because this is the
one place chronology is the content.

Companion docs: [../decisions.md](../decisions.md) for the numbered decisions,
[../roadmap.md](../roadmap.md) for what is next, [../product.md](../product.md)
for product scope.

Covers: moving application code into `src/`, and reorganizing the docs by the
question each one answers rather than by date.

---

## `3f3f916` — refactor: move application code into src/ (2026-07-30)

Root had eight source files sitting alongside config. Done now rather than
later because the diff scales with file count, and the repo is fifteen files
today.

To recreate:

1. `mkdir -p src/components src/data src/lib`
2. `git mv` each file into place. Use `git mv`, not `mv` — it stages the rename
   so `git log --follow` can still trace a file's history through the move.
   - `App.tsx` → `src/App.tsx`
   - `components/*.tsx` → `src/components/`
   - `db.ts`, `jobs.ts`, `shifts.ts`, `schema.sql` → `src/data/`
   - `format.ts`, `totals.ts`, `totals.test.ts` → `src/lib/`
3. The three folders are not arbitrary: they are the architecture boundary this
   project already argued for when `totals.ts` was split out of `shifts.ts`.
   `components/` renders, `data/` persists, `lib/` computes. `lib/` is
   specifically the code with no I/O, which is exactly why its test can run on
   Node with no device and no database.
4. Fix the relative imports the move broke. `index.ts` now points at
   `./src/App`; components reach `../data/` and `../lib/`; `src/lib/totals.ts`
   imports the `Shift` type from `../data/shifts`.
5. `schema.sql` moved with `db.ts` and stays colocated, so `require('./schema.sql')`
   is unchanged. `metro.config.js` needed no edit either — it pushes `sql` onto
   `assetExts`, which is path-independent.
6. Two hardcoded paths did need updating, and nothing would have caught them at
   compile time: `scripts/test-schema.sh` reads `src/data/schema.sql` now, and
   `.githooks/pre-commit` runs `src/lib/totals.test.ts`.
7. `README.md`'s markdown links to the moved files. `check-docs.sh` catches
   these, which is the entire reason that check exists.
8. Verified with `tsc --noEmit`, all three checks, and a real Metro bundle.

One thing worth knowing for future verification, because it nearly caused a
false alarm: **Metro's "Bundled (N modules)" log line is the number of modules
it transformed in that pass, not the size of the module graph.** With a warm
cache it printed 750 where a cold run printed 803. The reliable count is in the
delivered bundle itself — in a `dev=true` bundle each module carries its source
path as the fourth `__d(...)` argument, so:

```
curl -s "http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false" -o b.js
grep -oE '\},[0-9]+,\[[^]]*\],"[^"]+"' b.js | sed 's/.*,"//; s/"$//' | sort -u
```

Diffing that list before and after showed exactly the eight old paths leaving
and eleven new ones arriving, which is the actual proof the move was clean.
Earlier entries in this log quote module counts from cold-cache runs; they
happened to be right, but the metric is fragile and shouldn't be compared
across runs.

## `<pending>` — refactor: reorganize docs by question, not by date (2026-07-30)

The trigger was a fair complaint: there were a lot of doc files, all with
valuable content, and no structure that made any of them findable.

The rule this repo already had — no `BRAINSTORM_2.md`, because a numbered
sequel makes "which file has the Expo decision?" unanswerable — was right. But
the `docs/brainstorm/YYYY-MM-topic.md` scheme it was replaced with had quietly
reintroduced the same failure. With one month it read fine. With two, finding
the Expo question means remembering *when* it was asked. That is a number
wearing a date.

So: **split by the question a file answers, permanently. Dates go inside
entries, never in filenames.** The one exception is this build log, where
chronology is the content rather than an arbitrary boundary.

To recreate:

1. `git mv DECISIONS.md docs/decisions.md`.
2. `git mv docs/brainstorm/2026-07-<topic>.md docs/learning/<topic>.md` for all
   four topic files, dropping the date prefix.
3. `git mv docs/build-log/2026-07-<phase>.md docs/build-log/0N-<phase>.md`,
   numbering by phase order. The number carries sequence; the name still
   carries the description, so `04-log-shift-screen.md` tells you both.
4. Split `BRAINSTORM.md` — 475 lines doing five unrelated jobs, which is why it
   kept outgrowing every threshold — into:
   - `docs/roadmap.md`: the Order of Operations, the settled stack, open
     questions, and pre-submission housekeeping. **`NEXT` moved to the top of
     the file**, where the cold-agent handoff actually needs it, instead of
     being buried a hundred lines down.
   - `docs/product.md`: the problem, the differentiators, out-of-scope, the
     four layers, and the pushback/risks section.
   - The long-form backend option analysis (A/B/C) moved to
     `docs/learning/architecture.md`, and the data-model questions to
     `docs/learning/product-and-data-model.md` — both are question-and-answer
     material and belong with the rest of it.
5. Merge the two index layers into one. `BUILD_LOG.md` → `docs/build-log/2026-07.md`
   → phase files was one hop too many for 800 lines. Now `docs/build-log/README.md`
   is the only index. Same for the Q&A archive's index.
6. Write `docs/README.md` as the single entry point: a table mapping question
   to file.
7. Update `scripts/check-docs.sh` for the new paths (see below), then
   `CLAUDE.md`, `AGENTS.md`, and `README.md`.

**Historical references were deliberately not rewritten.** Entries in this log
describe commits made when the files really were called `DECISIONS.md` and
`BRAINSTORM.md`. Rewriting those sentences would make the log say something
that never happened, and this file's whole purpose is being able to recreate
the repo in order. The names are annotated here instead:

| Was | Is now |
|---|---|
| `DECISIONS.md` | `docs/decisions.md` |
| `BRAINSTORM.md` | split into `docs/roadmap.md` + `docs/product.md` |
| `BUILD_LOG.md` | `docs/build-log/README.md` |
| `docs/brainstorm/2026-07-*.md` | `docs/learning/*.md` |
| `docs/build-log/2026-07-*.md` | `docs/build-log/0N-*.md` |
| `App.tsx`, `db.ts`, `jobs.ts`, … | under `src/` |

### Changes to `check-docs.sh`

Three, and the first one is the important one:

1. **Required docs are now checked for existence, and a missing one fails.**
   Every filename-specific check was wrapped in `if [ -f DECISIONS.md ]`. Moving
   that file would have made the entire decision-reference check *silently stop
   running* while the script still printed `docs OK`. A check that skips itself
   when its input disappears is worse than no check, because it reports success.
   Verified by renaming a required doc and confirming the script fails.
2. The stale-date check now reads `docs/roadmap.md` and
   `docs/build-log/README.md` instead of the two files that no longer exist.
   The citation check looks for `decisions.md`.
3. The 500-line hard threshold became a 250-line prompt, with wording that says
   what to actually do: ask whether the file still answers one question. Length
   was only ever a proxy for that, and treating the proxy as the rule is what
   produced arbitrary splits.
