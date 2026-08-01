# Learning

Every question asked on this project, with its answer, dated. This is a
learning record, not a summary — entries keep enough detail to be useful read
back cold months later.

New questions get appended to whichever file below matches the topic. Dates go
in the entry heading, never in the filename: the question "which file has the
Expo answer?" should be answerable without remembering when it was asked.

Entries name files as they were named on the day the question was asked, so
older ones mention `DECISIONS.md`, `BRAINSTORM.md`, and a `schema.sql` at the
repo root. Those were rewritten on 2026-07-30 and the answers were not, because
editing them would make the record describe a repo that never existed. The
mapping from old name to new is in
[../build-log/06-restructure.md](../build-log/06-restructure.md).

| File | Covers |
|---|---|
| [architecture.md](architecture.md) | SQLite vs Postgres, Expo vs bare React Native, why there's no backend in MVP, why UI shouldn't wait on one, when UI code deserves its own component files |
| [product-and-data-model.md](product-and-data-model.md) | MVP vs later, why historical shifts keep their own rate, the shifts tombstone, where the YAGNI line actually sits |
| [docs-and-process.md](docs-and-process.md) | keeping docs from going stale, cross-agent handoffs, the first code review of the repo, whether the codebase reads as real engineering, test-count philosophy |
| [tooling.md](tooling.md) | SQL syntax from nothing, running and breaking the schema tests, GUI vs CLI for SQLite, wiring `schema.sql` into `expo-sqlite`, `expo-crypto`, Expo Go lagging behind Expo's SDKs, writing `reduce` by hand |

---

## Concepts to learn

Things hit while building that are worth understanding properly, rather than
just having working code for.

- React Native vs React — what actually differs, and what Expo adds on top
- Embedded databases (SQLite) vs server databases (Postgres) — the distinction
  that makes "which database" the wrong question
- Local-first architecture, and why sync conflict resolution is the hard part
- Database migrations — why changing a schema after you have real user data is
  the expensive part, and how that shapes MVP decisions
- App store submission process for both platforms
- W4 withholding math, and self-employment tax for 1099 (Layers 2 and 3)
- `PRAGMA user_version` as a migration guard — right now it's a blunt 0/1
  switch in `src/data/db.ts`, but the real pattern (every local-first sync
  library uses it) is a ladder: `if (currentVersion < 1) { ... }`,
  `if (currentVersion < 2) { ... }`, so a database can upgrade incrementally no
  matter which version it started at. Matters for real the first time a column
  gets added to `src/data/schema.sql` after the app has shipped
- `expo-sqlite`'s read/write API split — `runAsync`/`execAsync` for writes,
  `getAllAsync`/`getFirstAsync` for reads. Mixed these up writing the first
  draft of `listActiveJobs`, which stayed a copy-pasted `INSERT` under a new
  name instead of becoming a `SELECT`
- React/React Native fundamentals generally — first time writing any of it by
  hand this project. `useState` for state that survives a re-render, controlled
  `TextInput`s (`value` from state, `onChangeText` writes back), callback props
  as the only way a child tells a parent something happened, `View`/`Text`/
  `Pressable` as RN's own primitives instead of HTML elements,
  `StyleSheet.create` as RN's CSS equivalent
- React's `key` prop as a state-reset mechanism, not just a list-rendering
  requirement — used in `LogScreen.tsx` (`key={editingShift?.id ?? 'new'}`) to force
  `LogShiftForm` to remount instead of reusing the same instance with a prop
  that silently changed. Worth understanding well enough to recognize the next
  time "a prop changed but the UI didn't update" shows up
- `Array.prototype.reduce` — a `for` loop with the bookkeeping removed. Its
  starting value is what makes an empty array return zeros instead of throwing,
  and when the accumulator is an object, every field has to exist in that
  starting value or the first pass produces `NaN` silently
- `import type` as a runtime distinction, not a style preference — it's erased
  entirely, which is what lets `src/lib/totals.ts` be loaded by Node without
  dragging `expo-sqlite` in behind it
