// Run from the repo root with: node src/lib/federalWithholding2026.test.ts
import assert from 'node:assert/strict';
import {
  calculateFederalWithholdingCents,
  FEDERAL_WITHHOLDING_BRACKETS_2026,
  FEDERAL_WITHHOLDING_PAY_PERIODS,
  type FederalFilingStatus,
  type FederalWithholdingInput,
} from './federalWithholding2026.ts';

const STATUSES = Object.keys(FEDERAL_WITHHOLDING_BRACKETS_2026) as FederalFilingStatus[];
const EXPECTED_RATES = [0, 10, 12, 22, 24, 32, 35, 37];
const EXPECTED_TABLE_SIGNATURES: Record<
  FederalFilingStatus,
  { standard: string; step2Checked: string }
> = {
  'married-filing-jointly': {
    standard: '0:0:0|1930000:0:10|4410000:248000:12|12010000:1160000:22|23070000:3593200:24|42285000:8204800:32|53175000:11689600:35|78800000:20658350:37',
    step2Checked: '0:0:0|1610000:0:10|2850000:124000:12|6650000:580000:22|12180000:1796600:24|21787500:4102400:32|27232500:5844800:35|40045000:10329175:37',
  },
  'single-or-married-filing-separately': {
    standard: '0:0:0|750000:0:10|1990000:124000:12|5790000:580000:22|11320000:1796600:24|20927500:4102400:32|26372500:5844800:35|64810000:19297925:37',
    step2Checked: '0:0:0|805000:0:10|1425000:62000:12|3325000:290000:22|6090000:898300:24|10893800:2051200:32|13616300:2922400:35|32835000:9648963:37',
  },
  'head-of-household': {
    standard: '0:0:0|1555000:0:10|3325000:177000:12|8300000:774000:22|12125000:1615500:24|21730000:3920700:32|27175000:5663100:35|65615000:19117100:37',
    step2Checked: '0:0:0|1207500:0:10|2092500:88500:12|4580000:387000:22|6492500:807750:24|11295000:1960350:32|14017500:2831550:35|33237500:9558550:37',
  },
};

function input(overrides: Partial<FederalWithholdingInput> = {}): FederalWithholdingInput {
  return {
    taxYear: 2026,
    filingStatus: 'single-or-married-filing-separately',
    payPeriodsPerYear: 52,
    taxableWagesCents: 100_000,
    step2Checked: false,
    step3CreditsCents: 0,
    step4aOtherIncomeCents: 0,
    step4bDeductionsCents: 0,
    step4cExtraWithholdingCents: 0,
    exempt: false,
    ...overrides,
  };
}

// These five reference vectors are worked directly through Worksheet 1A and
// the printed-page-12 tables. Publication 15-T does not publish employee
// examples for Worksheet 1A, so the intermediate arithmetic is recorded here
// instead of presenting these as IRS-provided expected answers.
assert.equal(calculateFederalWithholdingCents(input()), 7_808);
assert.equal(calculateFederalWithholdingCents(input({ step2Checked: true })), 13_510);
assert.equal(
  calculateFederalWithholdingCents(
    input({
      filingStatus: 'married-filing-jointly',
      payPeriodsPerYear: 26,
      taxableWagesCents: 250_000,
    })
  ),
  13_231
);
assert.equal(
  calculateFederalWithholdingCents(
    input({
      filingStatus: 'head-of-household',
      payPeriodsPerYear: 24,
      taxableWagesCents: 300_000,
      step3CreditsCents: 240_000,
      step4aOtherIncomeCents: 120_000,
      step4bDeductionsCents: 360_000,
      step4cExtraWithholdingCents: 1_000,
    })
  ),
  12_250
);
assert.equal(
  calculateFederalWithholdingCents(
    input({
      filingStatus: 'married-filing-jointly',
      payPeriodsPerYear: 12,
      taxableWagesCents: 1_000_000,
      step2Checked: true,
      step3CreditsCents: 1_200_000,
      step4cExtraWithholdingCents: 2_500,
    })
  ),
  48_917
);

for (const filingStatus of STATUSES) {
  for (const step2Checked of [false, true]) {
    const schedule = step2Checked ? 'step2Checked' : 'standard';
    const brackets = FEDERAL_WITHHOLDING_BRACKETS_2026[filingStatus][schedule];

    assert.equal(brackets.length, 8);
    assert.deepEqual(brackets.map((bracket) => bracket[2]), EXPECTED_RATES);
    assert.equal(
      brackets.map((bracket) => bracket.join(':')).join('|'),
      EXPECTED_TABLE_SIGNATURES[filingStatus][schedule]
    );
    for (let index = 1; index < brackets.length; index += 1) {
      assert.ok(brackets[index - 1][0] < brackets[index][0]);
    }

    // Enter enough Step 4(a) income to land $100 inside every bracket. This
    // exercises each inclusive floor without introducing a second copy of the
    // source constants into the expected calculation.
    for (const [minimumCents, baseTaxCents, ratePercent] of brackets) {
      const worksheetAdjustment = step2Checked
        ? 0
        : filingStatus === 'married-filing-jointly'
          ? 1_290_000
          : 860_000;
      const expectedAnnualTaxCents = baseTaxCents + ratePercent * 100;
      assert.equal(
        calculateFederalWithholdingCents(
          input({
            filingStatus,
            payPeriodsPerYear: 2,
            taxableWagesCents: 0,
            step2Checked,
            step4aOtherIncomeCents: minimumCents + 10_000 + worksheetAdjustment,
          })
        ),
        Math.round(expectedAnnualTaxCents / 2)
      );
    }
  }
}

// Every Table 3 pay-period count works for every filing status and schedule.
for (const filingStatus of STATUSES) {
  for (const step2Checked of [false, true]) {
    for (const payPeriodsPerYear of FEDERAL_WITHHOLDING_PAY_PERIODS) {
      const result = calculateFederalWithholdingCents(
        input({ filingStatus, step2Checked, payPeriodsPerYear })
      );
      assert.ok(Number.isSafeInteger(result) && result >= 0);
    }
  }
}

// Step 3 cannot reduce tentative withholding below zero; Step 4(c) is then
// added per pay period. The same floor applies when Step 4(b) reduces adjusted
// annual wages to zero.
assert.equal(
  calculateFederalWithholdingCents(
    input({ step3CreditsCents: 1_000_000, step4cExtraWithholdingCents: 725 })
  ),
  725
);
assert.equal(
  calculateFederalWithholdingCents(
    input({ step4bDeductionsCents: 10_000_000, step4cExtraWithholdingCents: 725 })
  ),
  725
);

assert.equal(
  calculateFederalWithholdingCents(
    input({ exempt: true, taxableWagesCents: 1_000_000, step4cExtraWithholdingCents: 725 })
  ),
  0
);

// Ten cents in the 10% bracket is one cent of annual tax. Over two pay
// periods that is exactly half a cent, so the single final rounding goes up.
assert.equal(
  calculateFederalWithholdingCents(
    input({
      payPeriodsPerYear: 2,
      taxableWagesCents: 0,
      step4aOtherIncomeCents: 750_010 + 860_000,
    })
  ),
  1
);
assert.equal(
  calculateFederalWithholdingCents(
    input({
      payPeriodsPerYear: 2,
      taxableWagesCents: 0,
      step4aOtherIncomeCents: 750_009 + 860_000,
    })
  ),
  0
);

assert.throws(() => calculateFederalWithholdingCents(input({ taxYear: 2025 })), /Only tax year 2026/);
assert.throws(
  () => calculateFederalWithholdingCents(input({ taxYear: Number.MAX_SAFE_INTEGER + 1 })),
  /Tax year must be a safe integer/
);
assert.throws(() => calculateFederalWithholdingCents(input({ payPeriodsPerYear: 1 })), /Pay periods/);
assert.throws(
  () =>
    calculateFederalWithholdingCents(
      input({ filingStatus: 'qualifying-surviving-spouse' as FederalFilingStatus })
    ),
  /Filing status/
);
assert.throws(
  () => calculateFederalWithholdingCents(input({ step2Checked: 1 as unknown as boolean })),
  /checkbox values/
);
assert.throws(
  () => calculateFederalWithholdingCents(input({ exempt: 1 as unknown as boolean })),
  /checkbox values/
);

const amountFields = [
  'taxableWagesCents',
  'step3CreditsCents',
  'step4aOtherIncomeCents',
  'step4bDeductionsCents',
  'step4cExtraWithholdingCents',
] as const;
for (const field of amountFields) {
  assert.throws(() => calculateFederalWithholdingCents(input({ [field]: -1 })), /nonnegative/);
  assert.throws(
    () => calculateFederalWithholdingCents(input({ [field]: Number.MAX_SAFE_INTEGER + 1 })),
    /safe integer/
  );
}

assert.throws(
  () =>
    calculateFederalWithholdingCents(
      input({ taxableWagesCents: Number.MAX_SAFE_INTEGER, step4cExtraWithholdingCents: Number.MAX_SAFE_INTEGER })
    ),
  /result is too large/
);

console.log('2026 federal withholding OK');
