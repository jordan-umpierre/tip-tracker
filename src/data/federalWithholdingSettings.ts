import type * as SQLite from 'expo-sqlite';
import type { FederalFilingStatus } from '../lib/federalWithholding2026';

export type FederalWithholdingSettings = {
  id: string;
  job_id: string;
  effective_from: string;
  filing_status: FederalFilingStatus;
  pay_periods_per_year: number;
  step2_checked: number;
  step3_credits_cents: number;
  step4a_other_income_cents: number;
  step4b_deductions_cents: number;
  step4c_extra_withholding_cents: number;
  exempt: number;
  created_at: string;
  updated_at: string;
};

type RowReader = Pick<SQLite.SQLiteDatabase, 'getAllAsync'>;

// The first live caller is lossless backup. Create and pay-date lookup stay
// deferred until the tax UI calls them; schema tests already pin the eventual
// as-of query contract without leaving unused production APIs behind.
export async function readFederalWithholdingSettingsForBackup(
  database: RowReader
): Promise<FederalWithholdingSettings[]> {
  return database.getAllAsync<FederalWithholdingSettings>(
    `SELECT id, job_id, effective_from, filing_status, pay_periods_per_year,
            step2_checked, step3_credits_cents, step4a_other_income_cents,
            step4b_deductions_cents, step4c_extra_withholding_cents, exempt,
            created_at, updated_at
     FROM federal_withholding_settings
     ORDER BY id;`
  );
}
