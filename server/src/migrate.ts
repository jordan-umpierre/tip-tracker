import pg from "pg";

import { applyMigrations } from "./migrations.ts";

const connectionString = process.env.MIGRATION_DATABASE_URL?.trim();
if (!connectionString) throw new Error("MIGRATION_DATABASE_URL is required");

const database = new pg.Client({ connectionString });
await database.connect();
try {
  await applyMigrations(database);
} finally {
  await database.end();
}
