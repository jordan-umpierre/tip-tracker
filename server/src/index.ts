import { createServer } from "node:http";

import { createApp } from "./app.ts";
import { readConfig } from "./config.ts";

const config = readConfig(process.env);
const server = createServer(createApp());
let stopping = false;

function stop(signal: NodeJS.Signals) {
  if (stopping) return;
  stopping = true;

  server.close((error) => {
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
