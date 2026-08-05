import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";

import { createApp } from "../src/app.ts";
import { readConfig } from "../src/config.ts";

const server = createServer(createApp());
let baseUrl = "";

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test("reads only valid TCP ports", () => {
  assert.deepEqual(readConfig({}), { host: "0.0.0.0", port: 3000 });
  assert.deepEqual(readConfig({ HOST: "127.0.0.1", PORT: "8080" }), {
    host: "127.0.0.1",
    port: 8080,
  });
  assert.throws(() => readConfig({ PORT: "0" }), /PORT/);
  assert.throws(() => readConfig({ PORT: "3000.5" }), /PORT/);
  assert.throws(() => readConfig({ PORT: "65536" }), /PORT/);
});

test("reports health without exposing framework details", async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(response.headers.get("x-powered-by"), null);
});

test("bounds JSON request bodies and error responses", async () => {
  const response = await fetch(`${baseUrl}/missing`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(33_000) }),
  });

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "body_too_large" });
  assert.equal(Number(response.headers.get("content-length")) < 100, true);
});
