// Run from the repo root with: node src/lib/federalWithholdingForm.test.ts
import assert from 'node:assert/strict';
import {
  calculateSavedFederalWithholding,
  FEDERAL_WITHHOLDING_DISCLOSURE,
  isDuplicateFederalWithholdingSettingsError,
  isSupportedPayDateYear,
  parseMoneyToCents,
} from './federalWithholdingForm.ts';
import type { FederalWithholdingSettingValues } from './federalWithholdingForm.ts';
import { SUPPORTED_TAX_YEAR } from './federalWithholding2026.ts';

const settings: FederalWithholdingSettingValues = {
  filing_status: 'single-or-married-filing-separately',
  pay_periods_per_year: 26,
  step2_checked: 0,
  step3_credits_cents: 0,
  step4a_other_income_cents: 0,
  step4b_deductions_cents: 0,
  step4c_extra_withholding_cents: 0,
  exempt: 0,
};

assert.equal(parseMoneyToCents('0', true), 0);
assert.equal(parseMoneyToCents('12.3', true), 1230);
assert.equal(parseMoneyToCents(' 12.34 ', true), 1234);
assert.equal(parseMoneyToCents('', false), 0);
assert.throws(() => parseMoneyToCents('', true), /Enter a dollar amount/);
for (const invalid of ['-1', '$1.00', '1,000', '1.234', '.50', '01', 'word']) {
  assert.throws(() => parseMoneyToCents(invalid, true), /nonnegative dollar amount/);
}
assert.throws(
  () => parseMoneyToCents(`${Number.MAX_SAFE_INTEGER}`, true),
  /too large/
);
assert.equal(
  isDuplicateFederalWithholdingSettingsError({
    message:
      'UNIQUE constraint failed: federal_withholding_settings.job_id, federal_withholding_settings.effective_from',
  }),
  true
);
assert.equal(isDuplicateFederalWithholdingSettingsError('UNIQUE constraint failed: jobs.id'), false);
assert.equal(isDuplicateFederalWithholdingSettingsError(null), false);

const calculated = calculateSavedFederalWithholding('2026-08-15', 100_000, settings);
assert.equal(calculated.input.taxYear, 2026);
assert.equal(calculated.input.taxableWagesCents, 100_000);
assert.equal(calculated.input.step2Checked, false);
assert.throws(
  () => calculateSavedFederalWithholding('2026-02-30', 100_000, settings),
  /real paycheck pay date/
);
assert.throws(
  () => calculateSavedFederalWithholding('2025-08-15', 100_000, settings),
  /Only tax year 2026/
);
assert.equal(
  calculateSavedFederalWithholding('2026-08-15', 100_000, { ...settings, exempt: 1 })
    .withholdingCents,
  0
);
assert.match(FEDERAL_WITHHOLDING_DISCLOSURE, /app gross is not used/);
assert.match(FEDERAL_WITHHOLDING_DISCLOSURE, /not take-home pay/);
// The disclosure names the year, so publishing new tables without updating
// this constant would leave the screen telling the user the wrong one.
assert.match(FEDERAL_WITHHOLDING_DISCLOSURE, new RegExp(`Estimate only for ${SUPPORTED_TAX_YEAR}`));

// The screen disables its estimate button on the same answer the calculate
// handler refuses on. A pay date the app cannot parse is not supported either,
// so a year rolling over and a typo both land in the same disabled state.
assert.equal(isSupportedPayDateYear('2026-01-01'), true);
assert.equal(isSupportedPayDateYear('2026-12-31'), true);
assert.equal(isSupportedPayDateYear('2027-01-01'), false);
assert.equal(isSupportedPayDateYear('2025-12-31'), false);
assert.equal(isSupportedPayDateYear('2026-02-30'), false);
assert.equal(isSupportedPayDateYear(''), false);

console.log('federal withholding form OK');
