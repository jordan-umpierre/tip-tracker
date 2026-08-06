import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";

import { createApp } from "../src/app.ts";
import { close, listen } from "./http.ts";

// The limiter's budget is 600 requests a minute, which is deliberately too
// many to send one at a time in a test. So this app gets a clock it does not
// control: `currentTime` moves only when this file moves it, which makes both
// the exhaustion and the window rollover exact rather than timing-dependent.
let currentTime = 1_000_000;

const server = createServer(createApp({
  accounts: {
    findOrCreate: async () => { throw new Error("unused"); },
    isDeleted: async () => false,
    markDeleted: async () => undefined,
  },
  authAdmin: { deleteIdentity: async () => undefined },
  logError: () => undefined,
  now: () => currentTime,
  readiness: async () => undefined,
  sync: {
    listChanges: async () => ({ changes: [], hasMore: false, nextCursor: 0 }),
    mutate: async () => ({ status: 200, body: {} }),
  },
  verifyAccessToken: async () => { throw new Error("unused"); },
}));
let baseUrl = "";

before(async () => { baseUrl = await listen(server); });
after(async () => { await close(server); });

// Any route past the limiter will do. An unmatched path is the cheapest: it
// reaches the 404 handler without a token check or a database call, so what
// this measures is the limiter and nothing else.
async function hit() {
  return (await fetch(`${baseUrl}/missing`)).status;
}

test("a flood is bounded per window and released when the window rolls over", async () => {
  const statuses: number[] = [];
  for (let index = 0; index < 601; index += 1) statuses.push(await hit());

  // 600 allowed, and the 601st is the first refusal.
  assert.equal(statuses.filter((status) => status === 404).length, 600);
  assert.equal(statuses.at(-1), 429);

  const refused = await fetch(`${baseUrl}/missing`);
  assert.equal(refused.status, 429);
  assert.deepEqual(await refused.json(), { error: "too_many_requests" });

  // A refused client is told when to come back, and the answer is never zero
  // seconds -- "retry immediately" would be an invitation to keep flooding.
  const retryAfter = Number(refused.headers.get("retry-after"));
  assert.equal(Number.isInteger(retryAfter), true);
  assert.equal(retryAfter >= 1 && retryAfter <= 60, true);

  // One second short of the window is still inside it.
  currentTime += 59_000;
  assert.equal(await hit(), 429);

  // Past the window the budget starts over rather than trickling back.
  currentTime += 2_000;
  assert.equal(await hit(), 404);
});

test("health and readiness answer a probe that the limiter would refuse", async () => {
  // The previous test left this address one request into a fresh window;
  // spend the rest of the budget so the limiter is refusing again.
  for (let index = 0; index < 600; index += 1) await hit();
  assert.equal(await hit(), 429);

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  const ready = await fetch(`${baseUrl}/ready`);
  assert.equal(ready.status, 200);
});
