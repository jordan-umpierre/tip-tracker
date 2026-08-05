import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

import type pg from "pg";

type Queryable = Pick<pg.Client | pg.Pool, "query">;

export type Migration = {
  checksum: string;
  name: string;
  sql: string;
  version: number;
};

const migrationDirectory = new URL("../migrations/", import.meta.url);

export async function readMigrations(directory = migrationDirectory): Promise<Migration[]> {
  const names = (await readdir(directory))
    .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  const migrations = await Promise.all(names.map(async (name) => {
    const sql = await readFile(new URL(name, directory), "utf8");
    return {
      checksum: createHash("sha256").update(sql).digest("hex"),
      name,
      sql,
      version: Number(name.slice(0, 3)),
    };
  }));

  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error("Server migrations must be consecutively numbered from 001");
    }
  });
  return migrations;
}

export async function applyMigrations(database: pg.Client, requestedMigrations?: Migration[]) {
  const migrations = requestedMigrations ?? await readMigrations();
  await database.query("SELECT pg_advisory_lock(hashtext('tip-tracker-migrations'))");
  try {
    await database.query("BEGIN");
    await database.query("CREATE SCHEMA IF NOT EXISTS app");
    await database.query(`CREATE TABLE IF NOT EXISTS app.schema_migrations (
      version integer PRIMARY KEY CHECK (version > 0),
      name text NOT NULL UNIQUE,
      checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT transaction_timestamp()
    )`);
    await database.query("COMMIT");

    const applied = await database.query<{
      checksum: string;
      name: string;
      version: number;
    }>("SELECT version, name, checksum FROM app.schema_migrations ORDER BY version");
    assertAppliedMigrationsMatch(applied.rows, migrations);

    for (const migration of migrations.slice(applied.rows.length)) {
      await database.query("BEGIN");
      try {
        await database.query(migration.sql);
        await database.query(
          `INSERT INTO app.schema_migrations (version, name, checksum)
           VALUES ($1, $2, $3)`,
          [migration.version, migration.name, migration.checksum],
        );
        await database.query("COMMIT");
      } catch (error) {
        await database.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await database.query("SELECT pg_advisory_unlock(hashtext('tip-tracker-migrations'))");
  }
}

export async function assertSchemaCurrent(database: Queryable) {
  const migrations = await readMigrations();
  let applied: { checksum: string; name: string; version: number }[];
  try {
    const result = await database.query(
      "SELECT version, name, checksum FROM app.schema_migrations ORDER BY version",
    );
    applied = result.rows;
  } catch {
    throw new Error("Database schema has not been migrated");
  }
  assertAppliedMigrationsMatch(applied, migrations, true);
}

function assertAppliedMigrationsMatch(
  applied: { checksum: string; name: string; version: number }[],
  expected: Migration[],
  requireCurrent = false,
) {
  if (applied.length > expected.length || (requireCurrent && applied.length !== expected.length)) {
    throw new Error("Database schema version does not match this server");
  }
  applied.forEach((migration, index) => {
    const wanted = expected[index];
    if (
      !wanted || migration.version !== wanted.version ||
      migration.name !== wanted.name || migration.checksum !== wanted.checksum
    ) {
      throw new Error(`Database migration ${migration.version} does not match its tracked file`);
    }
  });
}
