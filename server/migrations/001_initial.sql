CREATE SCHEMA app;

CREATE SEQUENCE app.change_sequence AS bigint;

CREATE FUNCTION app.assign_update_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.server_version := OLD.server_version + 1;
  NEW.change_sequence := nextval('app.change_sequence');
  NEW.updated_at := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TABLE app.accounts (
  id uuid PRIMARY KEY,
  server_version bigint NOT NULL DEFAULT 1 CHECK (server_version > 0),
  change_sequence bigint NOT NULL DEFAULT nextval('app.change_sequence'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

-- This table deliberately does not reference accounts. Deleting an account
-- must leave a durable marker that blocks a still-valid access token from
-- recreating the cloud account before Supabase finishes deleting the identity.
CREATE TABLE app.deleted_accounts (
  account_id uuid PRIMARY KEY,
  deleted_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE app.jobs (
  account_id uuid NOT NULL,
  id text NOT NULL CHECK (id <> ''),
  name text NOT NULL CHECK (name <> ''),
  hourly_rate_cents bigint NOT NULL CHECK (hourly_rate_cents >= 0),
  archived_at timestamptz,
  overtime_enabled boolean NOT NULL DEFAULT false,
  workweek_start_weekday smallint NOT NULL DEFAULT 0
    CHECK (workweek_start_weekday BETWEEN 0 AND 6),
  workweek_start_time text NOT NULL DEFAULT '00:00'
    CHECK (workweek_start_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'),
  server_version bigint NOT NULL DEFAULT 1 CHECK (server_version > 0),
  change_sequence bigint NOT NULL DEFAULT nextval('app.change_sequence'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (account_id, id),
  FOREIGN KEY (account_id) REFERENCES app.accounts(id) ON DELETE CASCADE
);

CREATE TABLE app.shifts (
  account_id uuid NOT NULL,
  id text NOT NULL CHECK (id <> ''),
  job_id text NOT NULL CHECK (job_id <> ''),
  shift_date date NOT NULL,
  duration_seconds bigint NOT NULL CHECK (duration_seconds > 0),
  tips_cents bigint NOT NULL CHECK (tips_cents >= 0),
  hourly_rate_cents bigint NOT NULL CHECK (hourly_rate_cents >= 0),
  note text,
  deleted_at timestamptz,
  start_time text,
  end_time text,
  server_version bigint NOT NULL DEFAULT 1 CHECK (server_version > 0),
  change_sequence bigint NOT NULL DEFAULT nextval('app.change_sequence'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (account_id, id),
  FOREIGN KEY (account_id, job_id)
    REFERENCES app.jobs(account_id, id) ON DELETE CASCADE,
  CHECK ((start_time IS NULL) = (end_time IS NULL)),
  CHECK (start_time IS NULL OR start_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'),
  CHECK (end_time IS NULL OR end_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
);

CREATE TABLE app.federal_withholding_settings (
  account_id uuid NOT NULL,
  id text NOT NULL CHECK (id <> ''),
  job_id text NOT NULL CHECK (job_id <> ''),
  effective_from date NOT NULL,
  filing_status text NOT NULL CHECK (
    filing_status IN (
      'single-or-married-filing-separately',
      'married-filing-jointly',
      'head-of-household'
    )
  ),
  pay_periods_per_year smallint NOT NULL CHECK (
    pay_periods_per_year IN (2, 4, 12, 24, 26, 52, 260)
  ),
  step2_checked boolean NOT NULL,
  step3_credits_cents bigint NOT NULL CHECK (step3_credits_cents >= 0),
  step4a_other_income_cents bigint NOT NULL CHECK (step4a_other_income_cents >= 0),
  step4b_deductions_cents bigint NOT NULL CHECK (step4b_deductions_cents >= 0),
  step4c_extra_withholding_cents bigint NOT NULL CHECK (step4c_extra_withholding_cents >= 0),
  exempt boolean NOT NULL,
  deleted_at timestamptz,
  server_version bigint NOT NULL DEFAULT 1 CHECK (server_version > 0),
  change_sequence bigint NOT NULL DEFAULT nextval('app.change_sequence'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (account_id, id),
  FOREIGN KEY (account_id, job_id)
    REFERENCES app.jobs(account_id, id) ON DELETE CASCADE,
  UNIQUE (account_id, job_id, effective_from)
);

CREATE TRIGGER accounts_assign_update_version
BEFORE UPDATE ON app.accounts
FOR EACH ROW EXECUTE FUNCTION app.assign_update_version();

CREATE TRIGGER jobs_assign_update_version
BEFORE UPDATE ON app.jobs
FOR EACH ROW EXECUTE FUNCTION app.assign_update_version();

CREATE TRIGGER shifts_assign_update_version
BEFORE UPDATE ON app.shifts
FOR EACH ROW EXECUTE FUNCTION app.assign_update_version();

CREATE TRIGGER federal_settings_assign_update_version
BEFORE UPDATE ON app.federal_withholding_settings
FOR EACH ROW EXECUTE FUNCTION app.assign_update_version();
