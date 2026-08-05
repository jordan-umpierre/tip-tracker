import { createServer } from "node:http";

import pg from "pg";

import { createAccounts } from "./accounts.ts";
import { createApp } from "./app.ts";
import { createAccessTokenVerifier } from "./auth.ts";
import { readConfig } from "./config.ts";

const config = readConfig(process.env);
const database = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
const verifyAccessToken = createAccessTokenVerifier(config);
const server = createServer(createApp({ accounts: createAccounts(database), verifyAccessToken }));
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
