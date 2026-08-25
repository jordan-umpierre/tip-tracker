#!/usr/bin/env bash

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

fail=0
warn() { printf 'WARN  %s\n' "$1"; }
err() { printf 'FAIL  %s\n' "$1"; fail=1; }

docs=()
while IFS= read -r file; do docs+=("$file"); done < <(git ls-files '*.md')

sources=()
while IFS= read -r file; do sources+=("$file"); done \
  < <(git ls-files '*.md' '*.sql' '*.ts' '*.tsx' 'scripts/*')

ROADMAP=docs/roadmap.md
DECISIONS=docs/decisions.md
DOCS_INDEX=docs/README.md

required=(
  AGENTS.md
  README.md
  "$DOCS_INDEX"
  docs/acceptance.md
  "$DECISIONS"
  docs/privacy-policy.md
  "$ROADMAP"
  docs/store-disclosures.md
  server/README.md
  site/index.md
  site/support/index.md
)

for file in "${required[@]}"; do
  [ -f "$file" ] || err "$file is required"
done

first_roadmap_section=$(grep '^## ' "$ROADMAP" | head -n 1 || true)
[ "$first_roadmap_section" = "## NEXT" ] ||
  err "$ROADMAP must use ## NEXT as its first section"

next_count=$(grep -c '^## NEXT$' "$ROADMAP" || true)
[ "$next_count" -eq 1 ] || err "$ROADMAP must contain exactly one ## NEXT section"

grep -Fq '[acceptance.md](acceptance.md)' "$DOCS_INDEX" ||
  err "$DOCS_INDEX must link to docs/acceptance.md"

for file in "${docs[@]}"; do
  duplicates=$(grep '^#\{1,4\} ' "$file" | sort | uniq -d)
  [ -z "$duplicates" ] ||
    err "$file has duplicate headings:$(printf '\n        %s' "$duplicates")"
done

defined=$(grep -o '^### D[0-9]\+' "$DECISIONS" | grep -o '[0-9]\+' | sort -u)
mentioned=$(grep -hoE '\bD[0-9]+\b' -- "${sources[@]}" 2>/dev/null |
  grep -oE '[0-9]+' | sort -u)

for number in $mentioned; do
  grep -qx "$number" <<<"$defined" ||
    err "D$number is referenced but not defined in $DECISIONS"
done

while IFS= read -r hit; do
  err "$hit -- decisions live in $DECISIONS"
done < <(
  grep -noE '\bD[0-9]+ in [A-Za-z0-9_./-]+\.md' -- "${sources[@]}" 2>/dev/null |
    grep -v 'decisions\.md$' || true
)

for file in "${docs[@]}"; do
  while IFS= read -r target; do
    case "$target" in
      http* | mailto:*) continue ;;
    esac
    path="${target%%#*}"
    [ -z "$path" ] && continue
    [ -e "$(dirname "$file")/$path" ] ||
      err "$file links to '$path', which does not exist"
  done < <(grep -oE '\]\([^)]+\)' "$file" | sed 's/^](//; s/)$//')
done

todos=$(grep -nE 'TODO[(:]|FIXME[(:]' -- "${sources[@]}" 2>/dev/null || true)
[ -z "$todos" ] ||
  warn "open TODO/FIXME markers:$(printf '\n        %s' "$todos")"

for file in "${docs[@]}"; do
  lines=$(wc -l <"$file" | tr -d ' ')
  [ "$lines" -le 250 ] ||
    warn "$file is $lines lines; confirm it still answers one question"
done

hooks_path=$(git config --get core.hooksPath 2>/dev/null || true)
[ "$hooks_path" = ".githooks" ] ||
  warn "core.hooksPath is '$hooks_path', not .githooks"

staged=$(git diff --cached --name-only 2>/dev/null || true)
other_changes=$(grep -vx "$ROADMAP" <<<"$staged" || true)
roadmap_date=$(grep -oE '^Last updated: [0-9]{4}-[0-9]{2}-[0-9]{2}' "$ROADMAP" |
  grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' || true)
today=$(date +%F)

if [ -n "$other_changes" ] && [ "$roadmap_date" != "$today" ]; then
  warn "$ROADMAP was last updated on '$roadmap_date', not $today"
fi

if [ "$fail" -eq 0 ]; then
  echo "docs OK"
else
  echo
  echo "Fix the FAIL lines above."
fi

exit "$fail"
