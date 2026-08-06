import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

import pg from "pg";

import { createAccounts } from "../src/accounts.ts";
import { createApp } from "../src/app.ts";
import { applyMigrations, assertSchemaCurrent } from "../src/migrations.ts";
import { withTestDatabase } from "./database.ts";
import { close, listen } from "./http.ts";

function readinessApp(database: pg.Client | pg.Pool) {
  return createApp({
    accounts: createAccounts(database),
    authAdmin: { deleteIdentity: async () => undefined },
    logRequest: () => undefined,
    readiness: () => assertSchemaCurrent(database),
    sync: {
      listChanges: async () => ({ changes: [], hasMore: false, nextCursor: 0 }),
      mutate: async () => ({ status: 200, body: {} }),
    },
    verifyAccessToken: async () => { throw new Error("unused"); },
  });
}

async function readinessResponse(database: pg.Client | pg.Pool) {
  const server = createServer(readinessApp(database));
  const baseUrl = await listen(server);
  try {
    return await fetch(`${baseUrl}/ready`);
  } finally {
    await close(server);
  }
}

test("readiness requires a reachable current database schema", async () => {
  await withTestDatabase(async (database) => {
    const unmigrated = await readinessResponse(database);
    assert.equal(unmigrated.status, 503);
    assert.deepEqual(await unmigrated.json(), { error: "not_ready" });

    await applyMigrations(database);
    const ready = await readinessResponse(database);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { status: "ready" });
  });

  const unavailable = new pg.Pool({
    connectionString: "postgresql://127.0.0.1:1/postgres",
    connectionTimeoutMillis: 100,
  });
  try {
    const response = await readinessResponse(unavailable);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "not_ready" });
  } finally {
    await unavailable.end();
  }
});
