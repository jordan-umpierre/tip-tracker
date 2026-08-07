#!/usr/bin/env bash
#
# Catches the specific ways these docs have already gone stale.
#
# Run by hand:        ./scripts/check-docs.sh
# Runs automatically: .githooks/pre-commit
#
# Two real bugs on 2026-07-29 are why this exists: a duplicate "## Decision Log"
# heading (the stale copy still said no decisions had been made), and a D2
# subsection that ended up stranded after D3. Both came from appending to a long
# file without re-reading it. A person won't catch that reliably. A script will.
#
# Exits 1 on things that are wrong. Warnings print but don't block a commit.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

fail=0
warn() { printf 'WARN  %s\n' "$1"; }
err()  { printf 'FAIL  %s\n' "$1"; fail=1; }

# Only the files git actually tracks, and read the same way as everywhere else
# in this script - a loop fed by a process substitution, so it stays in this
# shell. Two reasons this beats a plain *.md glob:
#
#   1. CLAUDE.md is gitignored local guidance. Checking it made this script
#      behave differently on this laptop than on a fresh clone, which is the
#      opposite of what a consistency check is for.
#   2. *.md only matches the top level. Anything under docs/ was invisible.
#
# During a pre-commit run this reads the index, so a doc being added in this
# very commit is already in the list and gets checked.
docs=()
while IFS= read -r f; do docs+=("$f"); done < <(git ls-files '*.md')

# Same list plus the schema and the scripts, for the checks that look for
# decision references and TODO markers in code as well as prose.
srcs=()
while IFS= read -r f; do srcs+=("$f"); done < <(git ls-files '*.md' '*.sql' 'scripts/*')

# --- 0. The docs this script hardcodes by name ------------------------------
# Several checks below only work if a specific file is where they expect it.
# They used to be wrapped in "if [ -f DECISIONS.md ]", which meant renaming
# that file made the check silently stop running while this script still
# printed "docs OK". A check that skips itself when its input vanishes is worse
# than no check at all, because it reports success. So: name them here, and
# fail loudly if one moves. Whoever moves it updates this list on purpose.
DECISIONS=docs/decisions.md
ROADMAP=docs/roadmap.md
BUILDLOG=docs/build-log/README.md
for f in "$DECISIONS" "$ROADMAP" "$BUILDLOG"; do
  [ -f "$f" ] || err "$f is missing -- checks below depend on it. If it moved, update the paths at the top of this script."
done

# --- 1. Duplicate headings ------------------------------------------------
# The exact bug from 2026-07-29. Two identical headings means one of them is
# almost certainly a leftover nobody noticed.
for f in "${docs[@]}"; do
  dupes=$(grep '^#\{1,4\} ' "$f" | sort | uniq -d)
  [ -n "$dupes" ] && err "$f has duplicate headings:$(printf '\n        %s' "$dupes")"
done

# --- 2. Decision references that go nowhere -------------------------------
# Docs say things like "archived rather than deleted (D3)". If DECISIONS.md
# doesn't actually have a D3, that reference is a dead end for a reader.
if [ -f "$DECISIONS" ]; then
  # Decision numbers that actually exist, e.g. "### D3 - Soft delete..."
  defined=$(grep -o '^### D[0-9]\+' "$DECISIONS" | grep -o '[0-9]\+' | sort -u)
  # Every D<n> mentioned anywhere, in docs or in code comments.
  mentioned=$(grep -hoE '\bD[0-9]+\b' -- "${srcs[@]}" 2>/dev/null \
                | grep -oE '[0-9]+' | sort -u)
  for n in $mentioned; do
    grep -qx "$n" <<<"$defined" || err "D$n is referenced but not defined in $DECISIONS"
  done
  # A reference can name a number that exists and still send the reader to the
  # wrong file. schema.sql pointed at D1 in the brainstorm file for a while
  # after the split that moved the decision log into DECISIONS.md, and the check
  # above waved it through because it only ever asked whether a D1 existed
  # somewhere. So this one reads the filename in the citation too.
  #
  # Note the comment above deliberately does not spell out the bad citation the
  # way the docs would write it, or this check would flag its own example. Same
  # dodge as the TODO check further down.
  while IFS= read -r hit; do
    err "$hit -- decisions live in $DECISIONS"
  done < <(grep -noE '\bD[0-9]+ in [A-Za-z0-9_./-]+\.md' -- "${srcs[@]}" 2>/dev/null \
             | grep -v 'decisions\.md$' || true)

  # A decision nobody points at isn't necessarily wrong, but it's worth knowing.
  for n in $defined; do
    count=$(grep -hoE "\bD$n\b" -- "${srcs[@]}" 2>/dev/null | grep -c . || true)
    [ "$count" -le 1 ] && warn "D$n is defined but never referenced anywhere"
  done
fi

# --- 3. Links pointing at files that don't exist --------------------------
# Renaming a file silently breaks every markdown link to it.
for f in "${docs[@]}"; do
  # Pull the target out of [text](target), skip URLs and #anchors.
  #
  # The loop reads from a process substitution - "done < <(...)" - and not from
  # a pipe. That detail is load-bearing. Piping into "while read" runs the loop
  # in a subshell, which is a separate process with its own copy of every
  # variable. err() would set fail=1 on the copy, the subshell would exit, and
  # the copy would die with it. The parent still saw fail=0, so this check
  # printed FAIL and then let the commit through anyway. Reading from a process
  # substitution keeps the loop in this shell, so fail=1 sticks.
  while read -r target; do
    case "$target" in http*|mailto:*) continue ;; esac
    # Strip any #L42 line anchor before checking the path. A link that is only
    # an anchor, like [jump](#risks), leaves nothing behind and is skipped.
    path="${target%%#*}"
    [ -z "$path" ] && continue
    # Resolve the path against the directory of the file the link was written
    # in, not the repo root. A link inside docs/learning/ that points at
    # ../../src/data/schema.sql is correct, and checking it from the root would
    # call it broken. For a top-level file dirname gives ".", so nothing
    # changes there.
    [ -e "$(dirname "$f")/$path" ] || err "$f links to '$path', which doesn't exist"
  done < <(grep -oE '\]\([^)]+\)' "$f" | sed 's/^](//; s/)$//')
done

# Schema validation used to live here as a parse check. It moved to
# scripts/test-schema.sh, which loads the file (so a parse error still fails)
# and then goes further and checks the constraints actually reject bad data.
# The pre-commit hook runs both scripts. This one is about the prose.

# --- 4. Leftover TODO markers ---------------------------------------------
# Fine to have. Not fine to forget. Listing them keeps them deliberate.
# Requires a colon or paren, so prose *about* TODO markers doesn't match itself.
todos=$(grep -nE 'TODO[(:]|FIXME[(:]' -- "${srcs[@]}" 2>/dev/null || true)
[ -n "$todos" ] && warn "open TODO/FIXME markers:$(printf '\n        %s' "$todos")"

# --- 5. Docs long enough to be worth a second look ------------------------
# Deliberately not a split threshold. The old rule was a hard ~500 lines, and
# treating that as an instruction produced splits by arbitrary boundary (by
# calendar month) rather than by meaning -- which is how the docs ended up with
# filenames you had to already know the answer to find.
#
# Length was only ever a proxy for the real question: does this file still
# answer exactly one question? A long reference file you jump around in is
# fine. A medium one covering two unrelated topics is not. So this prints the
# prompt and lets a person answer it.
for f in "${docs[@]}"; do
  n=$(wc -l < "$f" | tr -d ' ')   # macOS wc pads with spaces
  [ "$n" -gt 250 ] && warn "$f is $n lines -- does it still answer one question? Split by question if not, leave it if so."
done

# --- 6. Git hooks not actually wired up ------------------------------------
# core.hooksPath has to be set for .githooks/pre-commit to run at all, and
# nothing inside the hook can warn about its own absence -- if this is unset,
# the hook simply never fires, silently. That sat unnoticed on this machine
# for a while despite a note claiming it was already done. Checked here too so
# a manual `./scripts/check-docs.sh` run (e.g. the first step of a cold-agent
# session, see AGENTS.md) still catches it even when the hook itself can't.
hooks_path=$(git config --get core.hooksPath 2>/dev/null || true)
[ "$hooks_path" != ".githooks" ] && warn "core.hooksPath is '$hooks_path', not .githooks -- pre-commit checks are not running. Fix: git config core.hooksPath .githooks"

# --- 7 & 8. Status logs going stale -----------------------------------------
# Two files carry a "Last updated" date that a later reader relies on:
#
#   docs/roadmap.md          -- what happened last and what's next. The single
#                               tracked source of truth a cold agent reads
#                               (see docs/README.md and AGENTS.md).
#   docs/build-log/README.md -- the index over the commit-by-commit log.
#
# If real work is staged for commit and either date isn't today, whoever reads
# it next is reading something stale. A warning, not a failure: most commits in
# a session are smaller than a full handoff and shouldn't be blocked on it.
check_stale_date() {
  local file="$1" nudge="$2" staged other_changes logged_date today
  [ -f "$file" ] || return 0
  staged=$(git diff --cached --name-only 2>/dev/null || true)
  # Changes to anything other than the log file itself. Updating only the log
  # is not "real work" that the log could be behind on.
  other_changes=$(grep -vx "$file" <<<"$staged" || true)
  logged_date=$(grep -oE '^Last updated: [0-9]{4}-[0-9]{2}-[0-9]{2}' "$file" \
                  | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}')
  today=$(date +%F)
  if [ -n "$other_changes" ] && [ -n "$logged_date" ] && [ "$logged_date" != "$today" ]; then
    warn "$file says 'Last updated: $logged_date', not today ($today) -- $nudge"
  fi
}
check_stale_date "$ROADMAP"  "update the history and the NEXT section if this session's work belongs in the log"
check_stale_date "$BUILDLOG" "add an entry for this session's commits if they belong in the log"

if [ "$fail" -eq 0 ]; then
  echo "docs OK"
else
  echo
  echo "Fix the FAIL lines above, or commit with --no-verify if you're sure."
fi
exit "$fail"
