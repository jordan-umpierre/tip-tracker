-- Version 1 stored shift duration as whole minutes. Rename the column first,
-- then convert every row to the version-2 unit. SQLite keeps the column's
-- NOT NULL and positive-value constraints during the rename.
ALTER TABLE shifts RENAME COLUMN minutes TO duration_seconds;
UPDATE shifts SET duration_seconds = duration_seconds * 60;
