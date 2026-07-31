# Docs

Every file here answers one question. Find the question, open that file.

| Question | File |
|---|---|
| What's next? What's been done? | [roadmap.md](roadmap.md) |
| What are we building, and why in this order? | [product.md](product.md) |
| Why was this chosen over the alternative? | [decisions.md](decisions.md) |
| How was this built, step by step? | [build-log/](build-log/) |
| I didn't understand something — what was the answer? | [learning/](learning/) |

Start with [roadmap.md](roadmap.md). Its `NEXT` section is at the top and is
the single source of truth for what to work on.

---

## How these stay organized

**Split by the question a file answers, never by number or date.** A filename
has to tell you what's inside. `BRAINSTORM_2.md` fails that test — you'd have
to open it to find out. So does `2026-07-tooling.md` once `2026-08-tooling.md`
exists, because then finding the Expo question means remembering which month
it was asked in. That's the same failure wearing a date instead of a number,
and this repo shipped it for a while before noticing.

The one exception is [build-log/](build-log/), where chronology *is* the
content. Its files are numbered by phase and still carry a descriptive name,
so `04-log-shift-screen.md` tells you both what and when.

**Length is a prompt to look, not a rule to obey.** `check-docs.sh` mentions
any doc over 250 lines. That's not an instruction to split it — a long
reference file you jump around in is fine. It's a prompt to ask whether the
file still answers one question. If it answers two, split it by question. If it
answers one and is just thorough, leave it alone.

**Keep rejected alternatives permanently.** In an interview, "here's what I
didn't do and why" is worth more than the decision alone. A decision with no
visible alternatives is an assumption.
