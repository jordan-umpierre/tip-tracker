# Learning — docs hygiene, process, review

Part of the [learning log](README.md) — every question asked on this project,
with its answer, dated. New entries append here.

Companion docs: [../roadmap.md](../roadmap.md) for what is next,
[../product.md](../product.md) for product scope,
[../decisions.md](../decisions.md) for the numbered decisions.

### 2026-07-29 — "How do we prevent anything becoming stale in the docs?"

Short answer: don't rely on remembering. Write a check.

Two real bugs got committed today, both from appending to a long file without
re-reading the whole thing:

- A duplicate `## Decision Log` heading, where the stale copy still said
  *"(empty — no real decisions made yet)"* while D1, D2, and D3 sat above it.
- A D2 subsection stranded after D3, so the React Native vs Flutter reasoning
  appeared to belong to the soft-delete decision.

Neither is the kind of thing a person reliably catches. Both are trivial for a
script.

So `scripts/check-docs.sh` now runs on every commit via a git hook. It checks:

1. Duplicate headings in any markdown file — the exact bug above
2. `D<n>` references that don't resolve to an entry in `DECISIONS.md`
3. Markdown links pointing at files that don't exist
4. That `schema.sql` still parses as valid SQL
5. Leftover TODO/FIXME markers (warning, not a failure)
6. Docs past the ~500 line split threshold (warning)

Failures block the commit. Warnings just print. `--no-verify` overrides it when
the check is wrong rather than the docs.

#### The general principle

> A rule nobody enforces is a rule that quietly stops being true.

We wrote several doc conventions today. Every one of them would have decayed
within a month on good intentions alone. The ones that survive are the ones with
a check behind them.

This is the same reasoning as putting `NOT NULL` and `CHECK` in the database
instead of trusting app code — see `schema.sql`. Constraints that can't be
bypassed beat discipline that can.

Corollary worth remembering: when adding a new convention, add its check at the
same time. If a convention can't be checked automatically, say so out loud
rather than writing a rule that only looks enforced.

#### Where the hook lives, and why it's slightly awkward

Git normally looks in `.git/hooks/`, which is not tracked by version control —
so a hook there would exist only on this laptop and vanish on a fresh clone.

The fix: the hook lives in `.githooks/` (tracked, committed) and git is pointed
at it with a one-time command:

```
git config core.hooksPath .githooks
```

Already run on this machine. Any fresh clone needs it once.

### 2026-07-30 — "Does everything look like a real engineer has made it?" (code review)

Mostly yes. The decision format, the kept alternatives, and the "deliberately
absent" notes at the bottom of `schema.sql` are all things senior engineers
actually write. Five things came out of the review, and the interesting part is
that the worst one was in the code written to prevent bad code.

**1. `check-docs.sh` printed FAIL and then exited 0.**

The broken-link check looked like this:

```sh
grep ... | while read -r target; do
  ... err "broken link"
done
```

A pipeline runs each side in its own process. The `while` loop was therefore a
**subshell** with its own copy of every variable. `err` set `fail=1` on that
copy, the subshell exited, and the copy died with it. Back in the parent, `fail`
was still `0`, so the script printed the failure and let the commit through.

The fix is to feed the loop without a pipe, so it stays in the current shell:

```sh
while read -r target; do
  ...
done < <(grep ...)
```

That `< <(...)` is called process substitution. Worth remembering as a shape,
because this bug is invisible — the code looks right and the output looks right
until you check the exit code.

**The bigger lesson:** the check had never been tested against a failure. It was
written, it printed "docs OK", and that was taken as evidence it worked. It only
ever proved the happy path. Every check now gets broken on purpose to confirm it
notices — the schema tests were verified by deleting a `CHECK`, swapping
`RESTRICT` for `CASCADE`, and adding the `UNIQUE` the schema argues against, and
watching each one turn the suite red.

A check that reports success while printing a failure is worse than no check,
because you trust it.

**2. `schema.sql` still sent readers to D1 in the brainstorm file.**

(Phrased around the literal on purpose — writing that citation out the way
`schema.sql` had it makes the new check flag this very sentence. Same dodge the
TODO check uses. A check strict enough to catch the bug is strict enough to
catch you describing the bug, which is a fair trade at one reworded word.)

D1 moved to `DECISIONS.md` in the split commit. The reference check confirmed a
D1 was defined *somewhere* and never looked at the filename beside it — so the
exact class of staleness the script exists for walked straight past it.

This is the general shape of the thing: **a check only ever covers the case you
encoded.** Writing "check for stale references" in a commit message is not the
same as checking for them. It now reads the filename too.

**3. The order of operations claimed tests that did not exist.**

It said the schema was "verified against sqlite3 with tests confirming every
constraint rejects bad data." There were no tests. The inserts had been run by
hand, which is a real thing to have done, but "tests" in a repo with no test
file is exactly what an interviewer pulls the thread on.

Two ways out: make the claim true, or make it accurate. Did both — the claim got
walked back to what actually happened, and `scripts/test-schema.sh` now exists so
the stronger claim is available honestly.

**4. `D3` and the schema disagreed about deleting.** Its own entry in
`2026-07-product-and-data-model.md`.

**5. `README.md` still said `Hello world!`** after seven commits. It is the first
thing anyone sees on GitHub. Now a real README.

Smaller things: a missing blank line before the `D3` heading; the `*.md` glob
picked up gitignored `CLAUDE.md`, so the checks behaved differently here than on
a fresh clone, and missed anything in a subdirectory; the link check skipped any
link carrying a `#L42` anchor instead of checking the file part.

### 2026-07-30 — "Does everything look like it was actually written by a real
engineer, besides maybe the comments?"

Yes — same verdict as the code review above, asked again after a session of
tooling and testing work rather than a doc pass. The comment density is the one
AI-flavored tell; a real engineer wouldn't narrate every line. Everything else
holds: constraints proven to reject bad data, rejected alternatives kept, and a
docs-check script that was caught silently no-op'ing and then actually fixed —
not something you fake, only something you get from having been burned by it.

### 2026-07-30 — "More tests are always better, right? Does testing slow the
app down?"

Pushed back on both halves. More tests isn't free — each one costs
maintenance and adds a slower suite, and a redundant test buys nothing but
false confidence. The actual target is one test per real behavior that can
break, no more: `test-schema.sh` has exactly one check per `NOT NULL`, `CHECK`,
and `FOREIGN KEY` in `schema.sql`, plus a handful of "this should be allowed"
checks to prove the schema isn't just rejecting everything. Coverage by design,
not coverage by volume.

On speed: tests never run as part of the app. `test-schema.sh` builds a
disposable temp database, checks it, deletes it — that only happens when a
person runs it by hand or the pre-commit hook runs it before a commit. The
compiled app a user opens never executes it, so there's no runtime cost.
