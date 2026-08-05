import assert from "node:assert/strict";
import type { createServer } from "node:http";

type HttpServer = ReturnType<typeof createServer>;

export async function listen(server: HttpServer) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

export async function close(server: HttpServer) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
