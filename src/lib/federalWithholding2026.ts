// 2026 federal income-tax withholding for one regular W2 paycheck.
//
// Source: IRS Publication 15-T (2026), Worksheet 1A on printed page 10 and
// the Percentage Method tables on printed page 12:
// https://www.irs.gov/pub/irs-pdf/p15t.pdf
//
// D20 deliberately stops here. This is not take-home pay, FICA, state or local
// tax, annual liability, a refund, or a supplemental-wage calculation. The
// caller supplies federal taxable wages from the paystub and the values from
// the 2020-or-later W-4 actually on file for that job.

export const FEDERAL_WITHHOLDING_PAY_PERIODS = [2, 4, 12, 24, 26, 52, 260] as const;

const FEDERAL_FILING_STATUSES = [
  'single-or-married-filing-separately',
  'married-filing-jointly',
  'head-of-household',
] as const;

export type FederalFilingStatus = (typeof FEDERAL_FILING_STATUSES)[number];

export type FederalWithholdingInput = {
  taxYear: number;
  filingStatus: FederalFilingStatus;
  payPeriodsPerYear: number;
  taxableWagesCents: number;
  step2Checked: boolean;
  step3CreditsCents: number;
  step4aOtherIncomeCents: number;
  step4bDeductionsCents: number;
  step4cExtraWithholdingCents: number;
  exempt: boolean;
};

type Bracket = readonly [minimumCents: number, baseTaxCents: number, ratePercent: number];
type Schedule = 'standard' | 'step2Checked';

// Each tuple is [adjusted annual wage floor, base annual tax, percentage].
// Values are cents except the whole-number percentage. The next row's floor
// is the current row's exclusive ceiling, so the table cannot contain a gap.
export const FEDERAL_WITHHOLDING_BRACKETS_2026: Record<
  FederalFilingStatus,
  Record<Schedule, readonly Bracket[]>
> = {
  'married-filing-jointly': {
    standard: [
      [0, 0, 0],
      [1_930_000, 0, 10],
      [4_410_000, 248_000, 12],
      [12_010_000, 1_160_000, 22],
      [23_070_000, 3_593_200, 24],
      [42_285_000, 8_204_800, 32],
      [53_175_000, 11_689_600, 35],
      [78_800_000, 20_658_350, 37],
    ],
    step2Checked: [
      [0, 0, 0],
      [1_610_000, 0, 10],
      [2_850_000, 124_000, 12],
      [6_650_000, 580_000, 22],
      [12_180_000, 1_796_600, 24],
      [21_787_500, 4_102_400, 32],
      [27_232_500, 5_844_800, 35],
      [40_045_000, 10_329_175, 37],
    ],
  },
  'single-or-married-filing-separately': {
    standard: [
      [0, 0, 0],
      [750_000, 0, 10],
      [1_990_000, 124_000, 12],
      [5_790_000, 580_000, 22],
      [11_320_000, 1_796_600, 24],
      [20_927_500, 4_102_400, 32],
      [26_372_500, 5_844_800, 35],
      [64_810_000, 19_297_925, 37],
    ],
    step2Checked: [
      [0, 0, 0],
      [805_000, 0, 10],
      [1_425_000, 62_000, 12],
      [3_325_000, 290_000, 22],
      [6_090_000, 898_300, 24],
      [10_893_800, 2_051_200, 32],
      [13_616_300, 2_922_400, 35],
      [32_835_000, 9_648_963, 37],
    ],
  },
  'head-of-household': {
    standard: [
      [0, 0, 0],
      [1_555_000, 0, 10],
      [3_325_000, 177_000, 12],
      [8_300_000, 774_000, 22],
      [12_125_000, 1_615_500, 24],
      [21_730_000, 3_920_700, 32],
      [27_175_000, 5_663_100, 35],
      [65_615_000, 19_117_100, 37],
    ],
    step2Checked: [
      [0, 0, 0],
      [1_207_500, 0, 10],
      [2_092_500, 88_500, 12],
      [4_580_000, 387_000, 22],
      [6_492_500, 807_750, 24],
      [11_295_000, 1_960_350, 32],
      [14_017_500, 2_831_550, 35],
      [33_237_500, 9_558_550, 37],
    ],
  },
};

const VALID_FILING_STATUSES = new Set<string>(FEDERAL_FILING_STATUSES);
const VALID_PAY_PERIODS = new Set<number>(FEDERAL_WITHHOLDING_PAY_PERIODS);
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

// fallow-ignore-next-line complexity -- Worksheet branches and bounds are asserted in federalWithholding2026.test.ts.
export function calculateFederalWithholdingCents(input: FederalWithholdingInput): number {
  validateInput(input);
  if (input.exempt) return 0;

  const payPeriods = BigInt(input.payPeriodsPerYear);
  const worksheetAdjustmentCents = input.step2Checked
    ? 0n
    : input.filingStatus === 'married-filing-jointly'
      ? 1_290_000n
      : 860_000n;
  const adjustedAnnualWagesCents = maximum(
    0n,
    BigInt(input.taxableWagesCents) * payPeriods +
      BigInt(input.step4aOtherIncomeCents) -
      BigInt(input.step4bDeductionsCents) -
      worksheetAdjustmentCents
  );
  const schedule = input.step2Checked ? 'step2Checked' : 'standard';
  const bracket = findBracket(
    FEDERAL_WITHHOLDING_BRACKETS_2026[input.filingStatus][schedule],
    adjustedAnnualWagesCents
  );

  // Keeping percentage hundredths and the pay-period division in one fraction
  // avoids rounding either annual tax or the Step 3 reduction on the way.
  const denominator = 100n * payPeriods;
  const annualTaxNumerator =
    BigInt(bracket[1]) * 100n +
    (adjustedAnnualWagesCents - BigInt(bracket[0])) * BigInt(bracket[2]);
  const afterCreditsNumerator = maximum(
    0n,
    annualTaxNumerator - BigInt(input.step3CreditsCents) * 100n
  );
  const finalNumerator =
    afterCreditsNumerator + BigInt(input.step4cExtraWithholdingCents) * denominator;

  // Publication 15-T printed page 9 lets employers consistently round wages
  // or pay-period tax to whole dollars. D20 instead keeps cents and makes one
  // deterministic half-up rounding here, so a valid employer result may differ.
  const roundedCents = (finalNumerator + denominator / 2n) / denominator;
  if (roundedCents > MAX_SAFE_BIGINT) throw new Error('The withholding result is too large.');
  return Number(roundedCents);
}

function findBracket(brackets: readonly Bracket[], annualWagesCents: bigint): Bracket {
  let selected = brackets[0];
  for (const bracket of brackets) {
    if (annualWagesCents < BigInt(bracket[0])) break;
    selected = bracket;
  }
  return selected;
}

function maximum(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}

// fallow-ignore-next-line complexity -- Every rejected field shape is asserted in federalWithholding2026.test.ts.
function validateInput(input: FederalWithholdingInput): void {
  if (!Number.isSafeInteger(input.taxYear)) throw new Error('Tax year must be a safe integer.');
  if (input.taxYear !== 2026) throw new Error('Only tax year 2026 is supported.');
  if (!VALID_FILING_STATUSES.has(input.filingStatus)) {
    throw new Error('Filing status is not supported.');
  }
  if (!VALID_PAY_PERIODS.has(input.payPeriodsPerYear)) {
    throw new Error('Pay periods must be one of 2, 4, 12, 24, 26, 52, or 260.');
  }
  if (typeof input.step2Checked !== 'boolean' || typeof input.exempt !== 'boolean') {
    throw new Error('W-4 checkbox values must be boolean.');
  }

  const amounts = [
    ['taxable wages', input.taxableWagesCents],
    ['Step 3 credits', input.step3CreditsCents],
    ['Step 4(a) other income', input.step4aOtherIncomeCents],
    ['Step 4(b) deductions', input.step4bDeductionsCents],
    ['Step 4(c) extra withholding', input.step4cExtraWithholdingCents],
  ] as const;
  for (const [label, amount] of amounts) {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new Error(`${label} must be a nonnegative safe integer number of cents.`);
    }
  }
}
