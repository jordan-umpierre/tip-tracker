import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";

import { createApp } from "../src/app.ts";
import type { RequestLogLine } from "../src/requestLog.ts";
import { close, listen } from "./http.ts";

const lines: RequestLogLine[] = [];
let currentTime = 5_000;

const server = createServer(createApp({
  accounts: {
    findOrCreate: async () => { throw new Error("unused"); },
    isDeleted: async () => false,
    markDeleted: async () => undefined,
  },
  authAdmin: { deleteIdentity: async () => undefined },
  logError: () => undefined,
  logRequest: (line) => { lines.push(line); },
  now: () => currentTime,
  readiness: async () => undefined,
  sync: {
    listChanges: async () => ({ changes: [], hasMore: false, nextCursor: 0 }),
    mutate: async () => ({ status: 200, body: {} }),
  },
  verifyAccessToken: async () => { throw new Error("no token accepted here"); },
}));
let baseUrl = "";

before(async () => { baseUrl = await listen(server); });
after(async () => { await close(server); });

test("a finished request is one structured line with no user data in it", async () => {
  lines.length = 0;
  const response = await fetch(`${baseUrl}/v1/me`, {
    headers: { authorization: "Bearer a-token-that-must-never-be-logged" },
  });
  assert.equal(response.status, 401);

  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0], {
    // No account field: the token never verified, so there is nothing to
    // attribute the request to and an unverified subject must not be trusted.
    durationMs: 0,
    method: "GET",
    path: "/v1/me",
    status: 401,
  });

  // The whole line, serialized the way the real logger writes it, must not
  // contain the credential that produced it.
  assert.equal(JSON.stringify(lines[0]).includes("a-token-that-must-never-be-logged"), false);
});

test("a stranger cannot choose how long a log line is", async () => {
  lines.length = 0;
  await fetch(`${baseUrl}/${"x".repeat(5_000)}`);

  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.path.length, 100);
  assert.equal(lines[0]?.status, 404);
});

test("passing probes stay silent and failing ones do not", async () => {
  lines.length = 0;
  await fetch(`${baseUrl}/health`);
  await fetch(`${baseUrl}/ready`);
  assert.equal(lines.length, 0);

  const failing = createServer(createApp({
    accounts: {
      findOrCreate: async () => { throw new Error("unused"); },
      isDeleted: async () => false,
      markDeleted: async () => undefined,
    },
    authAdmin: { deleteIdentity: async () => undefined },
    logError: () => undefined,
    logRequest: (line) => { lines.push(line); },
    readiness: async () => { throw new Error("database unreachable"); },
    sync: {
      listChanges: async () => ({ changes: [], hasMore: false, nextCursor: 0 }),
      mutate: async () => ({ status: 200, body: {} }),
    },
    verifyAccessToken: async () => { throw new Error("unused"); },
  }));
  const failingUrl = await listen(failing);
  try {
    assert.equal((await fetch(`${failingUrl}/ready`)).status, 503);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.status, 503);
  } finally {
    await close(failing);
  }
});

test("elapsed time is measured, not guessed", async () => {
  lines.length = 0;
  currentTime = 5_000;
  // Every read of this clock moves time forward, so the value logged has to
  // come from subtracting two reads taken around the request. A logger that
  // hardcoded a duration, or read the clock once, would report zero. The exact
  // number is deliberately not asserted: other middleware reads the same
  // injected clock, and pinning the total would pin their call count too.
  const advancing = () => (currentTime += 40);
  const slow = createServer(createApp({
    accounts: {
      findOrCreate: async () => { throw new Error("unused"); },
      isDeleted: async () => false,
      markDeleted: async () => undefined,
    },
    authAdmin: { deleteIdentity: async () => undefined },
    logError: () => undefined,
    logRequest: (line) => { lines.push(line); },
    now: advancing,
    readiness: async () => undefined,
    sync: {
      listChanges: async () => ({ changes: [], hasMore: false, nextCursor: 0 }),
      mutate: async () => ({ status: 200, body: {} }),
    },
    verifyAccessToken: async () => { throw new Error("unused"); },
  }));
  const slowUrl = await listen(slow);
  try {
    await fetch(`${slowUrl}/missing`);
    assert.equal(lines.length, 1);
    assert.equal((lines[0]?.durationMs ?? 0) >= 40, true);
  } finally {
    await close(slow);
  }
});
