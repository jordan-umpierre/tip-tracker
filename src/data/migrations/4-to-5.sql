-- Version 5 records local sync intent without changing SQLite's role as the
-- source of truth. Withholding settings gain the same retained-deletion fact
-- already used by shifts; old rows are active because NULL means not deleted.
ALTER TABLE federal_withholding_settings ADD COLUMN deleted_at TEXT;

CREATE TABLE sync_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
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

INSERT INTO sync_state (singleton) VALUES (1);

CREATE TABLE sync_metadata (
  entity_type TEXT NOT NULL CHECK (
    entity_type IN ('job', 'shift', 'federal_withholding_setting')
  ),
  entity_id TEXT NOT NULL,
  base_server_version INTEGER NOT NULL CHECK (base_server_version > 0),
  server_change_sequence INTEGER NOT NULL CHECK (server_change_sequence > 0),
  PRIMARY KEY (entity_type, entity_id)
);

CREATE TABLE sync_outbox (
  local_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (
    entity_type IN ('job', 'shift', 'federal_withholding_setting')
  ),
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
  UNIQUE (entity_type, entity_id)
);

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

-- Every pre-sync row is a local fact that must be offered to the first bound
-- account. Archive and tombstone columns stay in their rows and travel too.
INSERT INTO sync_outbox (entity_type, entity_id, operation)
SELECT 'job', id, 'upsert' FROM jobs ORDER BY id;

INSERT INTO sync_outbox (entity_type, entity_id, operation)
SELECT 'federal_withholding_setting', id, 'upsert'
FROM federal_withholding_settings ORDER BY id;

INSERT INTO sync_outbox (entity_type, entity_id, operation)
SELECT 'shift', id, 'upsert' FROM shifts ORDER BY id;
