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

### 2026-07-30 — "the 500 threshold is kind of arbitrary... I don't mind the BRAINSTORM_2.md idea but one of the agents shot that down... the root folder is starting to feel cramped"

Three complaints in one message, and all three were right. Worth recording
because the underlying mistake is one this project had already written a rule
against and then made anyway.

**On `BRAINSTORM_2.md` being shot down.** That was correct, but the stated
reason was too narrow. The real rule isn't "no numbers in filenames" — it's
**a filename has to tell you what's inside**. `BRAINSTORM_2.md` fails because
you must open it to find out. But so did `docs/brainstorm/2026-07-tooling.md`
the moment a second month existed: finding the Expo question would mean
remembering *when* it was asked. Same failure, wearing a date instead of a
number. The repo had replaced a rule violation with a subtler version of the
same violation and felt organized doing it.

The fix: split by the question a file answers, permanently, with dates inside
entries. The one exception is `docs/build-log/`, where chronology genuinely is
the content rather than an arbitrary boundary — those are numbered by phase and
still carry a descriptive name, so `04-log-shift-screen.md` tells you both.

**On 500 lines being arbitrary.** Also right, and the deeper problem is that it
was a proxy measured as if it were the thing. Length isn't what makes a doc
tiring. A 400-line reference you jump around in is fine; a 250-line wall you
must read start to finish to use any of isn't. What actually matters is
*whether the file still answers exactly one question*.

So the check now prints a prompt at 250 lines instead of an instruction at 500:
does this still answer one question? Split it if it answers two, leave it alone
if it's just thorough. `docs/decisions.md` sits at 375 lines and the correct
answer there is to leave it — which is the point. A rule that can be obeyed
without thinking produced splits along boundaries nobody chose.

**On the cramped root.** Standard practice is a minimal root: entry point,
config, and directories. Eight source files had accumulated at the top level.

They moved to `src/` split three ways — `components/` renders, `data/`
persists, `lib/` computes. Those aren't filing categories; they're the
architecture boundary this project had already argued for when `totals.ts` was
pulled out of `shifts.ts`. `lib/` is specifically the code with no I/O, which
is exactly why its tests run on Node with no device and no database. Naming the
folders after the boundary makes the layout teach the design instead of just
holding files.

Worth doing at fifteen files. Considerably worse at sixty.

### 2026-07-30 — "I'm not really sure I'm understanding the pros and cons of each"

Said when asked to choose between adding a per-row gross column to the shift
list versus rewriting the decision that referenced it. The useful part is how
the question got resolved rather than the answer itself.

Context: D5's write-up gave two reasons for rounding per shift. One was that
shifts store their own hourly rate, so there is no single rate to sum hours
against — a correctness argument. The other was that the list rows visibly add
up to the total — a usability argument. Then it turned out the rows don't
display their own gross, so the second reason described a screen that didn't
exist.

The tiebreaker: **never build a feature so that a comment becomes true.** That
is documentation driving scope, which is backwards. Fix the document to state
the reason that actually carries the weight, and log the feature idea as an
open question if it has merit on its own.

The interview version is the other half of it. "Shifts carry their own rate, so
per-shift rounding is the only rule that generalizes" is airtight and needs no
UI to defend. "The rows add up so users can check it" invites "so where is that
in the app?" — a question with no good answer that day. When two arguments
support the same decision, the one that survives without qualification is the
one to lead with.

### 2026-07-30 — "Not sure if an actual software engineer would fix that right now, or how that works into the order of operations"

Asked about three usability problems found while testing on a phone: the shift
list was cramped, the keyboard couldn't be dismissed, and the edit form showed
`7.583333333333333`.

The answer is that these do not all sort the same way, and the sorting rule is
worth having.

**Correctness bugs jump the queue, always.** A fourth defect turned up in the
same screenshots that nobody had reported: the date field defaulted to
tomorrow, because `todayIsoDate()` used `toISOString()`, which converts to UTC
first. Every evening shift west of Greenwich was filing under the wrong day.
That one gets fixed before anything else, because it silently corrupts the data
the entire product is built on — and unlike a layout complaint, the user never
finds out.

**Usability normally queues behind features — except where the project has
already committed otherwise.** `docs/product.md` says the log-a-shift flow is
the one screen that gets obsessed over, and everything else can be clean and
plain. Given that, a primary input you can't dismiss the keyboard on isn't a
polish item; it's an unfinished Layer 0. So they were fixed before starting
Layer 1 rather than logged as debt.

**And the seemingly cosmetic one wasn't cosmetic.** The obvious fix for
`7.583333333333333` is to show `7.6`, matching the list. That saves as 456
minutes instead of 455 — every edit would silently rewrite the shift, and a
one-minute shift would round to zero and violate a `CHECK`. See D6. It's worth
distrusting the word "cosmetic" on any field a user can edit and save back.

The transferable part: `tsc`, four test suites, `expo-doctor` and a clean
bundle all passed the whole time every one of these was live. Automated checks
verify what someone thought to check. A real device at 23:31 verifies what
nobody thought of.
