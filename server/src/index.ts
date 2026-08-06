import { createServer } from "node:http";

import pg from "pg";

import { createAccounts } from "./accounts.ts";
import { createApp } from "./app.ts";
import { createAccessTokenVerifier } from "./auth.ts";
import { createSupabaseAuthAdmin } from "./authAdmin.ts";
import { readConfig } from "./config.ts";
import { assertSchemaCurrent } from "./migrations.ts";
import { createSyncService } from "./sync.ts";

const config = readConfig(process.env);
const database = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
try {
  await assertSchemaCurrent(database);
} catch (error) {
  await database.end();
  throw error;
}
const verifyAccessToken = createAccessTokenVerifier(config);
const authAdmin = createSupabaseAuthAdmin(config);
const readiness = () => assertSchemaCurrent(database);
const server = createServer(createApp({
  accounts: createAccounts(database),
  authAdmin,
  readiness,
  sync: createSyncService(database),
  trustProxyHops: config.trustProxyHops,
  verifyAccessToken,
}));
let stopping = false;

function stop(signal: NodeJS.Signals) {
  if (stopping) return;
  stopping = true;

  server.close(async (error) => {
    await database.end();
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });

  // A broken keep-alive client must not hold a deployment open forever.
  setTimeout(() => server.closeAllConnections(), 10_000).unref();
  console.log(`Received ${signal}; stopping HTTP server`);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

server.listen(config.port, config.host, () => {
  console.log(`Tip Tracker API listening on ${config.host}:${config.port}`);
});
