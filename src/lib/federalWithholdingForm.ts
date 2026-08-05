import { parseCalendarDate } from './dates.ts';
import {
  calculateFederalWithholdingCents,
} from './federalWithholding2026.ts';
import type {
  FederalFilingStatus,
  FederalWithholdingInput,
} from './federalWithholding2026.ts';

export type FederalWithholdingSettingValues = {
  filing_status: FederalFilingStatus;
  pay_periods_per_year: number;
  step2_checked: number;
  step3_credits_cents: number;
  step4a_other_income_cents: number;
  step4b_deductions_cents: number;
  step4c_extra_withholding_cents: number;
  exempt: number;
};

export const FEDERAL_WITHHOLDING_DISCLOSURE =
  'Estimate only for 2026 federal income-tax withholding on one regular W-2 paycheck. It is not take-home pay, total payroll tax, annual tax liability, a refund, or an amount due. It excludes Social Security and Medicare taxes, state and local taxes, 1099 income, supplemental wages, nonresident-alien adjustments, part-year and cumulative-wage methods, and other special withholding methods. Enter federal taxable wages from the paystub; app gross is not used. Step 4(b) is accepted, but this app does not decide whether tips, overtime, or another deduction qualifies.';

// fallow-ignore-next-line complexity -- Empty, malformed, precision, and safe-integer branches are asserted in federalWithholdingForm.test.ts.
export function parseMoneyToCents(value: string, required: boolean): number {
  const trimmed = value.trim();
  if (trimmed === '') {
    if (required) throw new Error('Enter a dollar amount.');
    return 0;
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(trimmed)) {
    throw new Error('Use a nonnegative dollar amount with no more than two decimal places.');
  }

  const [dollars, cents = ''] = trimmed.split('.');
  const result = Number(dollars) * 100 + Number(cents.padEnd(2, '0'));
  if (!Number.isSafeInteger(result)) throw new Error('That dollar amount is too large.');
  return result;
}

// fallow-ignore-next-line complexity -- SQLite error shapes and false positives are asserted in federalWithholdingForm.test.ts.
export function isDuplicateFederalWithholdingSettingsError(cause: unknown): boolean {
  const message =
    cause !== null && typeof cause === 'object' && 'message' in cause
      ? String(cause.message)
      : String(cause);
  return (
    message.includes('UNIQUE constraint failed') &&
    message.includes('federal_withholding_settings.job_id') &&
    message.includes('federal_withholding_settings.effective_from')
  );
}

export function calculateSavedFederalWithholding(
  payDate: string,
  taxableWagesCents: number,
  settings: FederalWithholdingSettingValues
): { input: FederalWithholdingInput; withholdingCents: number } {
  const parsed = parseCalendarDate(payDate);
  if (!parsed) throw new Error('Enter a real paycheck pay date as YYYY-MM-DD.');

  const input: FederalWithholdingInput = {
    taxYear: parsed.year,
    taxableWagesCents,
    filingStatus: settings.filing_status,
    payPeriodsPerYear: settings.pay_periods_per_year,
    step2Checked: settings.step2_checked === 1,
    step3CreditsCents: settings.step3_credits_cents,
    step4aOtherIncomeCents: settings.step4a_other_income_cents,
    step4bDeductionsCents: settings.step4b_deductions_cents,
    step4cExtraWithholdingCents: settings.step4c_extra_withholding_cents,
    exempt: settings.exempt === 1,
  };

  return {
    input,
    withholdingCents: calculateFederalWithholdingCents(input),
  };
}
