# Tip Tracker project instructions

## Expo SDK 57

Read the exact versioned documentation at
https://docs.expo.dev/versions/v57.0.0/ before writing code.

## Cold agent handoff

Before changing anything:

1. Read the `NEXT` section at the top of `docs/roadmap.md`. It is the single
   tracked source of truth for current status and the next task.
2. Verify the working tree, branch tracking, stashes, and
   `git config --get core.hooksPath`. The hooks path must be `.githooks` so
   every commit runs the repository checks.
3. Read the relevant tracked decision, schema, source, and test files before
   relying on remembered project details.

Do not duplicate changing status, schema conventions, test counts, or next
steps here. Follow the global engineering, teaching, code-style, and Git rules.

## Agent skills

### Issue tracker

Issues and specs are tracked with GitHub Issues. See
`docs/agents/issue-tracker.md`.

### Triage labels

The repository uses the default triage label vocabulary. See
`docs/agents/triage-labels.md`.

### Domain docs

This repository uses a single-context domain-document layout. See
`docs/agents/domain.md`.
