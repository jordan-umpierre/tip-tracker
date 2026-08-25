import * as Crypto from 'expo-crypto';
import { getDb } from './db';
import { parseCalendarDate } from '../lib/dates';
import type { FederalWithholdingSettingValues } from '../lib/federalWithholdingForm';
import { isDuplicateFederalWithholdingSettingsError } from '../lib/federalWithholdingForm';

export type FederalWithholdingSettings = FederalWithholdingSettingValues & {
  id: string;
  job_id: string;
  effective_from: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export class DuplicateFederalWithholdingSettingsError extends Error {}

export async function createFederalWithholdingSettings(
  jobId: string,
  effectiveFrom: string,
  settings: FederalWithholdingSettingValues
): Promise<string> {
  if (!parseCalendarDate(effectiveFrom)) {
    throw new Error('Effective pay date must be a real YYYY-MM-DD date.');
  }

  const db = await getDb();
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    // Plain INSERT is the history guarantee. A duplicate date fails instead of
    // silently overwriting the W-4 values already attached to that pay date.
    await db.runAsync(
      `INSERT INTO federal_withholding_settings
         (id, job_id, effective_from, filing_status, pay_periods_per_year,
          step2_checked, step3_credits_cents, step4a_other_income_cents,
          step4b_deductions_cents, step4c_extra_withholding_cents, exempt,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      id,
      jobId,
      effectiveFrom,
      settings.filing_status,
      settings.pay_periods_per_year,
      settings.step2_checked,
      settings.step3_credits_cents,
      settings.step4a_other_income_cents,
      settings.step4b_deductions_cents,
      settings.step4c_extra_withholding_cents,
      settings.exempt,
      now,
      now
    );
  } catch (cause) {
    if (isDuplicateFederalWithholdingSettingsError(cause)) {
      throw new DuplicateFederalWithholdingSettingsError();
    }
    throw cause;
  }

  return id;
}

export async function getFederalWithholdingSettingsForPayDate(
  jobId: string,
  payDate: string
): Promise<FederalWithholdingSettings | null> {
  if (!parseCalendarDate(payDate)) {
    throw new Error('Pay date must be a real YYYY-MM-DD date.');
  }
  const db = await getDb();

  return db.getFirstAsync<FederalWithholdingSettings>(
    `SELECT id, job_id, effective_from, filing_status, pay_periods_per_year,
            step2_checked, step3_credits_cents, step4a_other_income_cents,
            step4b_deductions_cents, step4c_extra_withholding_cents, exempt,
            created_at, updated_at, deleted_at
     FROM federal_withholding_settings
     WHERE job_id = ? AND effective_from <= ? AND deleted_at IS NULL
     ORDER BY effective_from DESC
     LIMIT 1;`,
    jobId,
    payDate
  );
}
