-- Version 4 adds effective-dated federal withholding settings (D21).
-- Existing jobs and shifts are untouched, and no setting is invented: tax
-- estimates remain opt-in on an upgraded database.
CREATE TABLE federal_withholding_settings (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  effective_from TEXT NOT NULL CHECK (
    effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND strftime('%Y-%m-%d', effective_from) IS NOT NULL
    AND strftime('%Y-%m-%d', effective_from) = effective_from
  ),
  filing_status TEXT NOT NULL CHECK (
    filing_status IN (
      'single-or-married-filing-separately',
      'married-filing-jointly',
      'head-of-household'
    )
  ),
  pay_periods_per_year INTEGER NOT NULL CHECK (
    pay_periods_per_year IN (2, 4, 12, 24, 26, 52, 260)
  ),
  step2_checked INTEGER NOT NULL CHECK (step2_checked IN (0, 1)),
  step3_credits_cents INTEGER NOT NULL
    CHECK (step3_credits_cents BETWEEN 0 AND 9007199254740991),
  step4a_other_income_cents INTEGER NOT NULL
    CHECK (step4a_other_income_cents BETWEEN 0 AND 9007199254740991),
  step4b_deductions_cents INTEGER NOT NULL
    CHECK (step4b_deductions_cents BETWEEN 0 AND 9007199254740991),
  step4c_extra_withholding_cents INTEGER NOT NULL
    CHECK (step4c_extra_withholding_cents BETWEEN 0 AND 9007199254740991),
  exempt INTEGER NOT NULL CHECK (exempt IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE RESTRICT,
  UNIQUE (job_id, effective_from)
);
