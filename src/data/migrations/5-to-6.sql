-- Version 6 gives each installation a stable id so two devices can safely use
-- the same local outbox sequence under one account. It also retains conflicts
-- and permanent request failures beside the exact mutation they blocked.

-- These triggers read sync_state and replace sync_outbox rows. Drop them while
-- those two tables are rebuilt, then restore the same capture boundary below.
DROP TRIGGER jobs_sync_insert;
DROP TRIGGER jobs_sync_update;
DROP TRIGGER jobs_sync_delete;
DROP TRIGGER shifts_sync_insert;
DROP TRIGGER shifts_sync_update;
DROP TRIGGER shifts_sync_delete;
DROP TRIGGER federal_settings_sync_insert;
DROP TRIGGER federal_settings_sync_update;
DROP TRIGGER federal_settings_sync_delete;

CREATE TABLE sync_state_v6 (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  device_id TEXT NOT NULL CHECK (
    length(device_id) = 36
    AND device_id = lower(device_id)
    AND substr(device_id, 9, 1) = '-'
    AND substr(device_id, 14, 1) = '-'
    AND substr(device_id, 19, 1) = '-'
    AND substr(device_id, 24, 1) = '-'
    AND substr(device_id, 15, 1) = '4'
    AND substr(device_id, 20, 1) IN ('8', '9', 'a', 'b')
    AND device_id NOT GLOB '*[^0-9a-f-]*'
  ),
  account_id TEXT CHECK (
    account_id IS NULL OR (
      length(account_id) = 36
      AND account_id = lower(account_id)
      AND substr(account_id, 9, 1) = '-'
      AND substr(account_id, 14, 1) = '-'
      AND substr(account_id, 19, 1) = '-'
      AND substr(account_id, 24, 1) = '-'
      AND substr(account_id, 15, 1) BETWEEN '1' AND '8'
      AND substr(account_id, 20, 1) IN ('8', '9', 'a', 'b')
      AND account_id NOT GLOB '*[^0-9a-f-]*'
    )
  ),
  last_server_change_sequence INTEGER NOT NULL DEFAULT 0
    CHECK (last_server_change_sequence >= 0),
  applying_remote INTEGER NOT NULL DEFAULT 0 CHECK (applying_remote IN (0, 1))
);

INSERT INTO sync_state_v6
  (singleton, device_id, account_id, last_server_change_sequence, applying_remote)
SELECT
  singleton,
  lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
    substr(hex(randomblob(2)), 2, 3) || '-' ||
    substr(
      '89ab',
      1 + (instr('0123456789abcdef', lower(substr(hex(randomblob(1)), 1, 1))) - 1) % 4,
      1
    ) ||
    substr(hex(randomblob(2)), 2, 3) || '-' || hex(randomblob(6))
  ),
  account_id,
  last_server_change_sequence,
  applying_remote
FROM sync_state;

CREATE TABLE sync_outbox_v6 (
  local_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (
    entity_type IN ('job', 'shift', 'federal_withholding_setting')
  ),
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
  blocked_kind TEXT CHECK (blocked_kind IN ('conflict', 'permanent')),
  blocked_code TEXT CHECK (
    blocked_code IS NULL OR (
      length(blocked_code) BETWEEN 1 AND 64
      AND blocked_code NOT GLOB '*[^a-z0-9_]*'
    )
  ),
  blocked_response_json TEXT CHECK (
    blocked_response_json IS NULL OR (
      length(CAST(blocked_response_json AS BLOB)) BETWEEN 2 AND 10500000
      AND json_valid(blocked_response_json) = 1
      AND json_type(blocked_response_json) = 'object'
    )
  ),
  blocked_at TEXT,
  CHECK (
    (blocked_kind IS NULL AND blocked_code IS NULL
      AND blocked_response_json IS NULL AND blocked_at IS NULL)
    OR
    (blocked_kind IS NOT NULL AND blocked_code IS NOT NULL
      AND blocked_response_json IS NOT NULL AND blocked_at IS NOT NULL)
  ),
  UNIQUE (entity_type, entity_id)
);

INSERT INTO sync_outbox_v6
  (local_sequence, entity_type, entity_id, operation)
SELECT local_sequence, entity_type, entity_id, operation
FROM sync_outbox
ORDER BY local_sequence;

DROP TABLE sync_outbox;
ALTER TABLE sync_outbox_v6 RENAME TO sync_outbox;
DROP TABLE sync_state;
ALTER TABLE sync_state_v6 RENAME TO sync_state;

CREATE TRIGGER jobs_sync_insert AFTER INSERT ON jobs FOR EACH ROW
WHEN (SELECT applying_remote FROM sync_state WHERE singleton = 1) = 0
BEGIN
  DELETE FROM sync_outbox WHERE entity_type = 'job' AND entity_id = NEW.id;
  INSERT INTO sync_outbox (entity_type, entity_id, operation) VALUES ('job', NEW.id, 'upsert');
END;

CREATE TRIGGER jobs_sync_update AFTER UPDATE ON jobs FOR EACH ROW
WHEN (SELECT applying_remote FROM sync_state WHERE singleton = 1) = 0
BEGIN
  DELETE FROM sync_outbox WHERE entity_type = 'job' AND entity_id = NEW.id;
  INSERT INTO sync_outbox (entity_type, entity_id, operation) VALUES ('job', NEW.id, 'upsert');
END;

CREATE TRIGGER jobs_sync_delete AFTER DELETE ON jobs FOR EACH ROW
WHEN (SELECT applying_remote FROM sync_state WHERE singleton = 1) = 0
BEGIN
  DELETE FROM sync_outbox WHERE entity_type = 'job' AND entity_id = OLD.id;
  INSERT INTO sync_outbox (entity_type, entity_id, operation) VALUES ('job', OLD.id, 'delete');
END;

CREATE TRIGGER shifts_sync_insert AFTER INSERT ON shifts FOR EACH ROW
WHEN (SELECT applying_remote FROM sync_state WHERE singleton = 1) = 0
BEGIN
  DELETE FROM sync_outbox WHERE entity_type = 'shift' AND entity_id = NEW.id;
  INSERT INTO sync_outbox (entity_type, entity_id, operation) VALUES ('shift', NEW.id, 'upsert');
END;

CREATE TRIGGER shifts_sync_update AFTER UPDATE ON shifts FOR EACH ROW
WHEN (SELECT applying_remote FROM sync_state WHERE singleton = 1) = 0
BEGIN
  DELETE FROM sync_outbox WHERE entity_type = 'shift' AND entity_id = NEW.id;
  INSERT INTO sync_outbox (entity_type, entity_id, operation) VALUES ('shift', NEW.id, 'upsert');
END;

CREATE TRIGGER shifts_sync_delete AFTER DELETE ON shifts FOR EACH ROW
WHEN (SELECT applying_remote FROM sync_state WHERE singleton = 1) = 0
BEGIN
  DELETE FROM sync_outbox WHERE entity_type = 'shift' AND entity_id = OLD.id;
  INSERT INTO sync_outbox (entity_type, entity_id, operation) VALUES ('shift', OLD.id, 'delete');
END;

CREATE TRIGGER federal_settings_sync_insert
AFTER INSERT ON federal_withholding_settings FOR EACH ROW
WHEN (SELECT applying_remote FROM sync_state WHERE singleton = 1) = 0
BEGIN
  DELETE FROM sync_outbox
  WHERE entity_type = 'federal_withholding_setting' AND entity_id = NEW.id;
  INSERT INTO sync_outbox (entity_type, entity_id, operation)
  VALUES ('federal_withholding_setting', NEW.id, 'upsert');
END;

CREATE TRIGGER federal_settings_sync_update
AFTER UPDATE ON federal_withholding_settings FOR EACH ROW
WHEN (SELECT applying_remote FROM sync_state WHERE singleton = 1) = 0
BEGIN
  DELETE FROM sync_outbox
  WHERE entity_type = 'federal_withholding_setting' AND entity_id = NEW.id;
  INSERT INTO sync_outbox (entity_type, entity_id, operation)
  VALUES ('federal_withholding_setting', NEW.id, 'upsert');
END;

CREATE TRIGGER federal_settings_sync_delete
AFTER DELETE ON federal_withholding_settings FOR EACH ROW
WHEN (SELECT applying_remote FROM sync_state WHERE singleton = 1) = 0
BEGIN
  DELETE FROM sync_outbox
  WHERE entity_type = 'federal_withholding_setting' AND entity_id = OLD.id;
  INSERT INTO sync_outbox (entity_type, entity_id, operation)
  VALUES ('federal_withholding_setting', OLD.id, 'delete');
END;
