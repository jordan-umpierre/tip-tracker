-- Keep device history separate from server ordering authority. Defaults make
-- direct administrative inserts safe, while the sync API always supplies the
-- original canonical device timestamps.
ALTER TABLE app.jobs ADD COLUMN client_created_at timestamptz;
ALTER TABLE app.jobs ADD COLUMN client_updated_at timestamptz;
UPDATE app.jobs
SET client_created_at = created_at, client_updated_at = updated_at;
ALTER TABLE app.jobs ALTER COLUMN client_created_at SET NOT NULL;
ALTER TABLE app.jobs ALTER COLUMN client_updated_at SET NOT NULL;
ALTER TABLE app.jobs ALTER COLUMN client_created_at SET DEFAULT transaction_timestamp();
ALTER TABLE app.jobs ALTER COLUMN client_updated_at SET DEFAULT transaction_timestamp();

ALTER TABLE app.shifts ADD COLUMN client_created_at timestamptz;
ALTER TABLE app.shifts ADD COLUMN client_updated_at timestamptz;
UPDATE app.shifts
SET client_created_at = created_at, client_updated_at = updated_at;
ALTER TABLE app.shifts ALTER COLUMN client_created_at SET NOT NULL;
ALTER TABLE app.shifts ALTER COLUMN client_updated_at SET NOT NULL;
ALTER TABLE app.shifts ALTER COLUMN client_created_at SET DEFAULT transaction_timestamp();
ALTER TABLE app.shifts ALTER COLUMN client_updated_at SET DEFAULT transaction_timestamp();

ALTER TABLE app.federal_withholding_settings ADD COLUMN client_created_at timestamptz;
ALTER TABLE app.federal_withholding_settings ADD COLUMN client_updated_at timestamptz;
UPDATE app.federal_withholding_settings
SET client_created_at = created_at, client_updated_at = updated_at;
ALTER TABLE app.federal_withholding_settings ALTER COLUMN client_created_at SET NOT NULL;
ALTER TABLE app.federal_withholding_settings ALTER COLUMN client_updated_at SET NOT NULL;
ALTER TABLE app.federal_withholding_settings
  ALTER COLUMN client_created_at SET DEFAULT transaction_timestamp();
ALTER TABLE app.federal_withholding_settings
  ALTER COLUMN client_updated_at SET DEFAULT transaction_timestamp();

-- SQLite permits an empty job name and portable backups preserve it exactly.
-- Only identifiers are required to be nonempty at this boundary.
ALTER TABLE app.jobs DROP CONSTRAINT jobs_name_check;

CREATE TABLE app.sync_operations (
  account_id uuid NOT NULL,
  device_id uuid NOT NULL,
  operation_id bigint NOT NULL
    CHECK (operation_id BETWEEN 1 AND 9007199254740991),
  request_checksum text NOT NULL
    CHECK (request_checksum ~ '^[0-9a-f]{64}$'),
  response_status smallint NOT NULL CHECK (response_status IN (200, 409)),
  response_body jsonb NOT NULL CHECK (jsonb_typeof(response_body) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (account_id, device_id, operation_id),
  FOREIGN KEY (account_id) REFERENCES app.accounts(id) ON DELETE CASCADE
);

CREATE INDEX jobs_account_changes_idx
  ON app.jobs (account_id, change_sequence);
CREATE INDEX shifts_account_changes_idx
  ON app.shifts (account_id, change_sequence);
CREATE INDEX federal_settings_account_changes_idx
  ON app.federal_withholding_settings (account_id, change_sequence);
CREATE INDEX sync_operations_retention_idx
  ON app.sync_operations (account_id, created_at);
