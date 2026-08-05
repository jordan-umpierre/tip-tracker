import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { withTestDatabase } from "./database.ts";

const migrationUrl = new URL("../migrations/001_initial.sql", import.meta.url);

test("migration preserves ownership, versions, tombstones, and rollback", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  await withTestDatabase(async (database) => {
      await database.query("BEGIN");
      await database.query(migration);
      await database.query("ROLLBACK");
      const rolledBack = await database.query("SELECT to_regnamespace('app') AS schema_name");
      assert.equal(rolledBack.rows[0].schema_name, null);

      await database.query("BEGIN");
      await database.query(migration);
      await database.query("COMMIT");

      const accountA = "00000000-0000-4000-8000-000000000001";
      const accountB = "00000000-0000-4000-8000-000000000002";
      const jobA = "legacy-job:breadmaker-7";
      const shiftA = "legacy-shift:2026-08-05-am";

      await database.query("INSERT INTO app.accounts (id) VALUES ($1), ($2)", [accountA, accountB]);
      await database.query(
        "INSERT INTO app.jobs (account_id, id, name, hourly_rate_cents) VALUES ($1, $2, 'Bar', 1500)",
        [accountA, jobA],
      );
      await database.query(
        `INSERT INTO app.shifts
          (account_id, id, job_id, shift_date, duration_seconds, tips_cents,
           hourly_rate_cents, start_time, end_time)
         VALUES ($1, $2, $3, '2026-08-05', 14400, 5000, 1500, '09:30', '13:30')`,
        [accountA, shiftA, jobA],
      );
      const exactTimes = await database.query(
        `SELECT workweek_start_time, start_time, end_time
         FROM app.jobs JOIN app.shifts USING (account_id)
         WHERE app.jobs.id = $1 AND app.shifts.id = $2`,
        [jobA, shiftA],
      );
      assert.deepEqual(exactTimes.rows[0], {
        end_time: "13:30",
        start_time: "09:30",
        workweek_start_time: "00:00",
      });

      await assert.rejects(
        database.query(
          `INSERT INTO app.jobs
            (account_id, id, name, hourly_rate_cents, workweek_start_time)
           VALUES ($1, 'bad-time-job', 'Bad', 0, '09:30:00')`,
          [accountA],
        ),
        /check constraint/i,
      );
      await assert.rejects(
        database.query(
          `INSERT INTO app.shifts
            (account_id, id, job_id, shift_date, duration_seconds, tips_cents,
             hourly_rate_cents, start_time, end_time)
           VALUES ($1, 'bad-time-shift', $2, '2026-08-05', 1, 0, 0,
             '09:30:00', '10:30:00')`,
          [accountA, jobA],
        ),
        /check constraint/i,
      );
      await assert.rejects(
        database.query(
          `INSERT INTO app.jobs (account_id, id, name, hourly_rate_cents)
           VALUES ($1, '', 'Empty id', 0)`,
          [accountA],
        ),
        /check constraint/i,
      );

      await assert.rejects(
        database.query(
          `INSERT INTO app.shifts
            (account_id, id, job_id, shift_date, duration_seconds, tips_cents, hourly_rate_cents)
           VALUES ($1, 'cross-account-shift', $2, '2026-08-05', 1, 0, 0)`,
          [accountB, jobA],
        ),
        /foreign key/i,
      );

      await database.query(
        `INSERT INTO app.shifts
          (account_id, id, job_id, shift_date, duration_seconds, tips_cents, hourly_rate_cents)
         VALUES ($1, 'same-looking-shift', $2, '2026-08-05', 14400, 5000, 1500)`,
        [accountA, jobA],
      );

      await database.query(
        `INSERT INTO app.federal_withholding_settings
          (account_id, id, job_id, effective_from, filing_status,
           pay_periods_per_year, step2_checked, step3_credits_cents,
           step4a_other_income_cents, step4b_deductions_cents,
           step4c_extra_withholding_cents, exempt)
         VALUES ($1, 'legacy-setting:2026-01-01', $2, '2026-01-01',
           'single-or-married-filing-separately', 26, false, 0, 0, 0, 0, false)`,
        [accountA, jobA],
      );

      await assert.rejects(
        database.query(
          `INSERT INTO app.federal_withholding_settings
            (account_id, id, job_id, effective_from, filing_status,
             pay_periods_per_year, step2_checked, step3_credits_cents,
             step4a_other_income_cents, step4b_deductions_cents,
             step4c_extra_withholding_cents, exempt)
           VALUES ($1, 'cross-account-setting', $2, '2026-01-01',
             'single-or-married-filing-separately', 26, false, 0, 0, 0, 0, false)`,
          [accountB, jobA],
        ),
        /foreign key/i,
      );

      const beforeUpdate = await database.query(
        "SELECT server_version, change_sequence FROM app.shifts WHERE account_id = $1 AND id = $2",
        [accountA, shiftA],
      );
      await database.query(
        "UPDATE app.shifts SET deleted_at = transaction_timestamp() WHERE account_id = $1 AND id = $2",
        [accountA, shiftA],
      );
      const afterUpdate = await database.query(
        "SELECT server_version, change_sequence, deleted_at FROM app.shifts WHERE account_id = $1 AND id = $2",
        [accountA, shiftA],
      );
      assert.equal(afterUpdate.rows[0].server_version, "2");
      assert.equal(Number(afterUpdate.rows[0].change_sequence) > Number(beforeUpdate.rows[0].change_sequence), true);
      assert(afterUpdate.rows[0].deleted_at instanceof Date);

      await database.query("DELETE FROM app.accounts WHERE id = $1", [accountA]);
      const remaining = await database.query(
        `SELECT
          (SELECT count(*) FROM app.accounts) AS accounts,
          (SELECT count(*) FROM app.jobs) AS jobs,
          (SELECT count(*) FROM app.shifts) AS shifts,
          (SELECT count(*) FROM app.federal_withholding_settings) AS settings`,
      );
      assert.deepEqual(remaining.rows[0], {
        accounts: "1",
        jobs: "0",
        shifts: "0",
        settings: "0",
      });
  });
});
