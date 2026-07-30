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

docs=(*.md)

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
if [ -f DECISIONS.md ]; then
  # Decision numbers that actually exist, e.g. "### D3 - Soft delete..."
  defined=$(grep -o '^### D[0-9]\+' DECISIONS.md | grep -o '[0-9]\+' | sort -u)
  # Every D<n> mentioned anywhere, in docs or in code comments.
  mentioned=$(grep -rhoE '\bD[0-9]+\b' -- *.md *.sql scripts/ 2>/dev/null \
                | grep -oE '[0-9]+' | sort -u)
  for n in $mentioned; do
    grep -qx "$n" <<<"$defined" || err "D$n is referenced but not defined in DECISIONS.md"
  done
  # A decision nobody points at isn't necessarily wrong, but it's worth knowing.
  for n in $defined; do
    count=$(grep -rhoE "\bD$n\b" -- *.md *.sql 2>/dev/null | grep -c . || true)
    [ "$count" -le 1 ] && warn "D$n is defined but never referenced anywhere"
  done
fi

# --- 3. Links pointing at files that don't exist --------------------------
# Renaming a file silently breaks every markdown link to it.
for f in "${docs[@]}"; do
  # Pull the target out of [text](target), skip URLs and #anchors.
  grep -oE '\]\([^)#]+\)' "$f" | sed 's/^](//; s/)$//' | while read -r target; do
    case "$target" in http*|mailto:*) continue ;; esac
    # Strip any #L42 line anchor before checking the path.
    path="${target%%#*}"
    [ -z "$path" ] && continue
    [ -e "$path" ] || err "$f links to '$path', which doesn't exist"
  done
done

# --- 4. The schema still has to be valid SQL ------------------------------
# A schema that stopped parsing is the worst kind of stale: it reads fine.
if [ -f schema.sql ]; then
  if command -v sqlite3 >/dev/null; then
    tmp=$(mktemp -u).db
    if ! sqlite3 "$tmp" < schema.sql 2>/tmp/schema_err; then
      err "schema.sql does not parse: $(cat /tmp/schema_err)"
    fi
    rm -f "$tmp"
  else
    warn "sqlite3 not installed, skipping schema validation"
  fi
fi

# --- 5. Leftover TODO markers ---------------------------------------------
# Fine to have. Not fine to forget. Listing them keeps them deliberate.
# Requires a colon or paren, so prose *about* TODO markers doesn't match itself.
todos=$(grep -rnE 'TODO[(:]|FIXME[(:]' -- *.md *.sql 2>/dev/null || true)
[ -n "$todos" ] && warn "open TODO/FIXME markers:$(printf '\n        %s' "$todos")"

# --- 6. Docs that outgrew the split threshold -----------------------------
# The rule in CLAUDE.md is ~500 lines, split by purpose. This is the nag.
for f in "${docs[@]}"; do
  n=$(wc -l < "$f" | tr -d ' ')   # macOS wc pads with spaces
  [ "$n" -gt 500 ] && warn "$f is $n lines, past the ~500 split threshold"
done

if [ "$fail" -eq 0 ]; then
  echo "docs OK"
else
  echo
  echo "Fix the FAIL lines above, or commit with --no-verify if you're sure."
fi
exit "$fail"
