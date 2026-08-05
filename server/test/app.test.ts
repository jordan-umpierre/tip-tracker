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
  const env = {
    DATABASE_URL: "postgresql://localhost/tip_tracker",
    SUPABASE_AUDIENCE: "authenticated",
    SUPABASE_ISSUER: "https://example.supabase.co/auth/v1",
    SUPABASE_JWKS_URL: "https://example.supabase.co/auth/v1/.well-known/jwks.json",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    SUPABASE_URL: "https://example.supabase.co",
  };
  assert.deepEqual(readConfig(env), {
    audience: "authenticated",
    databaseUrl: "postgresql://localhost/tip_tracker",
    host: "0.0.0.0",
    issuer: "https://example.supabase.co/auth/v1",
    jwksUrl: new URL(env.SUPABASE_JWKS_URL),
    port: 3000,
    serviceRoleKey: "test-service-role-key",
    supabaseUrl: new URL(env.SUPABASE_URL),
  });
  assert.deepEqual(readConfig({ ...env, HOST: "127.0.0.1", PORT: "8080" }), {
    audience: "authenticated",
    databaseUrl: "postgresql://localhost/tip_tracker",
    host: "127.0.0.1",
    issuer: "https://example.supabase.co/auth/v1",
    jwksUrl: new URL(env.SUPABASE_JWKS_URL),
    port: 8080,
    serviceRoleKey: "test-service-role-key",
    supabaseUrl: new URL(env.SUPABASE_URL),
  });
  assert.throws(() => readConfig({ ...env, PORT: "0" }), /PORT/);
  assert.throws(() => readConfig({ ...env, PORT: "3000.5" }), /PORT/);
  assert.throws(() => readConfig({ ...env, PORT: "65536" }), /PORT/);
  assert.throws(() => readConfig({ ...env, DATABASE_URL: "" }), /DATABASE_URL/);
  assert.throws(() => readConfig({ ...env, SUPABASE_JWKS_URL: "http://example.test" }), /https/);
  assert.throws(() => readConfig({ ...env, SUPABASE_SERVICE_ROLE_KEY: "" }), /SERVICE_ROLE/);
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
