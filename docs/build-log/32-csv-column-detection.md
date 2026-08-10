# 32 — Teaching the importer to read a CSV it has not seen before

The importer refused six real shift exports. All six were readable files full
of real work. This is what was actually wrong and what it changed.

## The complaint

Six CSVs from three jobs, roughly three years of history each, would not
import. The app gave one error and no detail.

## What the error was hiding

Running the parser against the files directly, rather than through the app,
gave the same message for all six:

```
sourceRow: 1
'Expected these columns: Date, Wage, Cash Tips, Credit Tips, Hours, Note,
 Daily Income, Start Time, End Time.'
```

Row 1 is the header line. Every file died there, before a single data row was
read, which is why the app could not say anything more useful. Behind that one
error sat three separate problems:

1. **Names.** `Hourly Wage` instead of `Wage`, `clock_in` instead of
   `Start Time`, `Total Pay` instead of `Daily Income`. Pure renaming.
2. **Formats.** ISO dates in all six files, and 24-hour clock times in three.
   These would have failed row by row even with perfect headers.
3. **Shape.** One file splits hours across `Hours Worked`, `Regular Hours`, and
   `Overtime Hours`; another has no tips column at all.

Two things that looked like problems were not. A single `tips` column is fine —
the schema stores one `tips_cents` and the old parser only split cash and
credit in order to add them back together. And `Overtime Hours` has nowhere to
go on purpose: `overtime.ts` derives overtime from a 40-hour week under D14, so
it is not a stored column.

## Checking the assumption before designing around it

The hours question looked like it needed a formula. `Hours Worked` is blank
whenever clock times are present, so no single column works. Before building
anything, all 624 rows of the driving export got counted:

```
{ rows: 624, blankRegularHours: 0, rowsWithOvertime: 7,
  hoursWorkedDisagreesWithSum: 0 }
```

`Regular Hours` is never blank, and wherever `Hours Worked` is filled it equals
`Regular + Overtime` exactly. So `Hours = Regular + Overtime` covers every row,
and no formula syntax is needed — just addition.

That mattered, because the app already adds two columns together for cash and
credit tips. Generalizing that one existing behaviour into "a value maps to a
list of columns, summed" covers both real cases and deletes the tips special
case from the row parser. It is the whole combining rule. There is no
expression language, and there is no adapter per vendor.

## The 790 warnings

With the columns mapped, all six files parsed and produced 790 daily-income
disagreements. That is 73% of rows, which is not a warning, it is noise.

Measuring the distribution split it cleanly:

```
n=790 min=1 p50=3 p99=418 max=3291   (cents)
over7: 12
```

778 disagreements are one to seven cents. Hours carry two decimals, so a source
that computed pay from exact minutes is always a few cents off from the same
sum computed from rounded hours. That is arithmetic, not a discrepancy.

The other 12 are real, and checking one explained all of them:

```
recorded: 95.01, flatRate: '89.15', overtimeAt1_5x: '95.01'
```

They are the overtime rows. The source paid time-and-a-half; the app stores
duration and base rate and works out overtime itself. Those 12 are exactly the
rows a person should look at, and they had been buried under 778 rounding
notes.

The allowance is derived from the row's own wage — `ceil(wage x 0.005) + 1`
cents — rather than being a flat number, so a $50/h job gets the room it
actually needs instead of a threshold tuned for $10.

## The part that stayed strict

Detection guesses. A wrong guess about which column holds money produces a
history that looks complete and is not, and gets discovered months later in a
total nobody can explain.

So the guess is never applied on its own. The preview lists the column behind
each value above the import button, and `parseShiftImportCsv` takes a corrected
mapping as an argument. The picker UI is deliberately not built: the parser
side of it exists, so it is UI work and nothing else, and it goes in the first
time a real file is guessed wrong rather than on the assumption that one will
be.

Validation did not loosen either. Calendar checks still reject `2023-02-30`,
the 24-hour ceiling on hours now applies to the *total* rather than to each
part, and a row that lost or gained a field is still an integrity failure —
counted against the file's own header line rather than a fixed nine.

## Where it landed

All six exports import: 2,813 rows, zero errors. Warnings went from 790 to 29,
and the ones left mean something.

The one file with no tips column imports at zero tips and says so once, at the
top of the warning list. That is a real job that earns no tips, and refusing a
real record of real work would have been the wrong call.

## Worth remembering

The header check was doing three jobs at once: tokenizing, identifying columns,
and validating fields. Only the middle one was wrong, and because all three
lived in one function, one bad header name discarded 624 valid rows. Splitting
identification out left the RFC 4180 state machine and every field validator
untouched.

Also: `fake-data/` is gitignored, so the tests pin the six header lines as
string literals instead of reading the files. A test that passes only on the
laptop holding the data is not a test.
