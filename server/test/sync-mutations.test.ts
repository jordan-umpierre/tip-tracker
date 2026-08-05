import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

import { exportJWK, generateKeyPair, SignJWT } from "jose";
import type pg from "pg";

import { createAccounts } from "../src/accounts.ts";
import { createApp } from "../src/app.ts";
import { createAccessTokenVerifier } from "../src/auth.ts";
import { applyMigrations } from "../src/migrations.ts";
import { createSyncService } from "../src/sync.ts";
import { poolAdapter, withTestDatabase } from "./database.ts";
import { close, listen } from "./http.ts";

const accountA = "00000000-0000-4000-8000-000000000001";
const accountB = "00000000-0000-4000-8000-000000000002";
const deviceA = "10000000-0000-4000-8000-000000000001";
const deviceB = "10000000-0000-4000-8000-000000000002";
const issuer = "https://local-sync-auth.example/auth/v1";
const audience = "authenticated";
const timestamp = "2026-08-05T12:34:56.000Z";

async function withSyncApi(
  run: (context: {
    baseUrl: string;
    database: pg.Client;
    tokenFor: (subject: string) => Promise<string>;
  }) => Promise<void>,
) {
  const signingKeys = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(signingKeys.publicKey);
  const jwksServer = createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ keys: [{ ...publicJwk, alg: "RS256", kid: "sync-key", use: "sig" }] }));
  });
  const jwksBaseUrl = await listen(jwksServer);

  try {
    await withTestDatabase(async (database) => {
      await applyMigrations(database);
      const apiServer = createServer(createApp({
        accounts: createAccounts(database),
        authAdmin: { deleteIdentity: async () => undefined },
        logError: () => undefined,
        readiness: async () => undefined,
        sync: createSyncService(poolAdapter(database)),
        verifyAccessToken: createAccessTokenVerifier({
          audience,
          issuer,
          jwksUrl: new URL(jwksBaseUrl),
        }),
      }));
      const baseUrl = await listen(apiServer);
      const tokenFor = (subject: string) => new SignJWT({})
        .setProtectedHeader({ alg: "RS256", kid: "sync-key" })
        .setSubject(subject)
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(signingKeys.privateKey);

      try {
        await run({ baseUrl, database, tokenFor });
      } finally {
        await close(apiServer);
      }
    });
  } finally {
    await close(jwksServer);
  }
}

function jobMutation(operationId: number, overrides: Record<string, unknown> = {}) {
  return {
    baseServerVersion: null,
    deviceId: deviceA,
    entityId: "job-a",
    entityType: "job",
    operation: "upsert",
    operationId,
    record: {
      archivedAt: null,
      createdAt: timestamp,
      hourlyRateCents: 1500,
      name: "Bar",
      overtimeEnabled: false,
      updatedAt: timestamp,
      workweekStartTime: "00:00",
      workweekStartWeekday: 0,
    },
    ...overrides,
  };
}

function shiftMutation(operationId: number, entityId: string) {
  return {
    baseServerVersion: null,
    deviceId: deviceA,
    entityId,
    entityType: "shift",
    operation: "upsert",
    operationId,
    record: {
      createdAt: timestamp,
      deletedAt: null,
      durationSeconds: 14_400,
      endTime: "13:30",
      hourlyRateCents: 1500,
      jobId: "job-a",
      note: null,
      shiftDate: "2026-08-05",
      startTime: "09:30",
      tipsCents: 5000,
      updatedAt: timestamp,
    },
  };
}

function settingMutation(operationId: number, entityId: string) {
  return {
    baseServerVersion: null,
    deviceId: deviceA,
    entityId,
    entityType: "federal_withholding_setting",
    operation: "upsert",
    operationId,
    record: {
      createdAt: timestamp,
      deletedAt: null,
      effectiveFrom: "2026-01-01",
      exempt: false,
      filingStatus: "single-or-married-filing-separately",
      jobId: "job-a",
      payPeriodsPerYear: 26,
      step2Checked: false,
      step3CreditsCents: 0,
      step4aOtherIncomeCents: 0,
      step4bDeductionsCents: 0,
      step4cExtraWithholdingCents: 0,
      updatedAt: timestamp,
    },
  };
}

async function mutate(baseUrl: string, token: string, body: unknown) {
  return fetch(`${baseUrl}/v1/sync/mutations`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

type MutationBody = {
  change?: { record: Record<string, unknown>; serverVersion: number };
  error?: string;
  remote?: { serverVersion: number };
};

async function readMutationBody(response: Response) {
  return response.json() as Promise<MutationBody>;
}

test("sync mutations isolate tenants, replay exactly, and surface conflicts", async () => {
  await withSyncApi(async ({ baseUrl, database, tokenFor }) => {
    const tokenA = await tokenFor(accountA);
    const tokenB = await tokenFor(accountB);
    const createJob = jobMutation(1);

    const created = await mutate(baseUrl, tokenA, createJob);
    assert.equal(created.status, 200);
    const createdBody = await readMutationBody(created);
    assert.equal(createdBody.change?.serverVersion, 1);
    assert.equal(createdBody.change?.record.createdAt, timestamp);

    const replay = await mutate(baseUrl, tokenA, createJob);
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), createdBody);

    const reused = await mutate(baseUrl, tokenA, {
      ...createJob,
      record: { ...createJob.record, name: "Changed under the same key" },
    });
    assert.equal(reused.status, 409);
    assert.deepEqual(await reused.json(), { error: "idempotency_key_reused" });

    const secondDevice = await mutate(baseUrl, tokenA, jobMutation(1, {
      deviceId: deviceB,
      entityId: "job-b",
    }));
    assert.equal(secondDevice.status, 200);

    const sameIdOtherTenant = await mutate(baseUrl, tokenB, createJob);
    assert.equal(sameIdOtherTenant.status, 200);
    const tenantRows = await database.query(
      "SELECT account_id, id FROM app.jobs WHERE id = 'job-a' ORDER BY account_id",
    );
    assert.deepEqual(tenantRows.rows, [
      { account_id: accountA, id: "job-a" },
      { account_id: accountB, id: "job-a" },
    ]);

    for (const mutation of [shiftMutation(2, "shift-a"), shiftMutation(3, "shift-b")]) {
      const response = await mutate(baseUrl, tokenA, mutation);
      assert.equal(response.status, 200);
    }
    const equalShifts = await database.query(
      "SELECT id FROM app.shifts WHERE account_id = $1 ORDER BY id",
      [accountA],
    );
    assert.deepEqual(equalShifts.rows, [{ id: "shift-a" }, { id: "shift-b" }]);

    assert.equal((await mutate(baseUrl, tokenA, settingMutation(4, "setting-a"))).status, 200);
    const duplicateSetting = await mutate(baseUrl, tokenA, settingMutation(5, "setting-b"));
    assert.equal(duplicateSetting.status, 409);
    assert.equal((await readMutationBody(duplicateSetting)).error, "unique_conflict");

    const update2 = jobMutation(6, {
      baseServerVersion: 1,
      record: { ...createJob.record, name: "Version two", updatedAt: "2026-08-05T13:00:00.000Z" },
    });
    assert.equal((await mutate(baseUrl, tokenA, update2)).status, 200);

    const staleMutation = jobMutation(7, {
      baseServerVersion: 1,
      record: { ...createJob.record, name: "Stale" },
    });
    const stale = await mutate(baseUrl, tokenA, staleMutation);
    assert.equal(stale.status, 409);
    const staleBody = await readMutationBody(stale);
    assert.equal(staleBody.remote?.serverVersion, 2);

    const update3 = jobMutation(8, {
      baseServerVersion: 2,
      record: { ...createJob.record, archivedAt: timestamp, updatedAt: "2026-08-05T14:00:00.000Z" },
    });
    assert.equal((await mutate(baseUrl, tokenA, update3)).status, 200);
    const staleReplay = await mutate(baseUrl, tokenA, staleMutation);
    assert.deepEqual(await staleReplay.json(), staleBody);

    const shift = shiftMutation(9, "shift-a");
    const shiftTombstone = {
      ...shift,
      baseServerVersion: 1,
      record: { ...shift.record, deletedAt: timestamp, updatedAt: timestamp },
    };
    const deletedShift = await mutate(baseUrl, tokenA, shiftTombstone);
    assert.equal(deletedShift.status, 200);
    assert.equal((await readMutationBody(deletedShift)).change?.record.deletedAt, timestamp);

    const setting = settingMutation(10, "setting-a");
    const settingTombstone = {
      ...setting,
      baseServerVersion: 1,
      record: { ...setting.record, deletedAt: timestamp, updatedAt: timestamp },
    };
    const deletedSetting = await mutate(baseUrl, tokenA, settingTombstone);
    assert.equal(deletedSetting.status, 200);
    assert.equal((await readMutationBody(deletedSetting)).change?.record.deletedAt, timestamp);
  });
});

test("sync mutation validation rejects spoofing and malformed local facts", async () => {
  await withSyncApi(async ({ baseUrl, tokenFor }) => {
    const token = await tokenFor(accountA);
    const valid = jobMutation(1);
    const invalid = [
      { ...valid, accountId: accountB },
      { ...valid, deviceId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" },
      { ...valid, entityId: "" },
      { ...valid, operationId: Number.MAX_SAFE_INTEGER + 1 },
      { ...valid, record: { ...valid.record, workweekStartTime: "09:30:00" } },
      { ...shiftMutation(2, "bad-date"), record: { ...shiftMutation(2, "bad-date").record, shiftDate: "2026-02-30" } },
      { ...shiftMutation(3, "one-time"), record: { ...shiftMutation(3, "one-time").record, endTime: null } },
    ];
    for (const body of invalid) {
      const response = await mutate(baseUrl, token, body);
      assert.equal(response.status, 422);
      assert.deepEqual(await response.json(), { error: "invalid_request" });
    }

    const largeButValid = jobMutation(10, {
      entityId: "large-job",
      record: { ...valid.record, name: "x".repeat(33_000) },
    });
    assert.equal((await mutate(baseUrl, token, largeButValid)).status, 200);
  });
});

test("a failed domain write rolls back its idempotency record", async () => {
  await withSyncApi(async ({ baseUrl, database, tokenFor }) => {
    await database.query(`
      CREATE FUNCTION app.fail_sync_test() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.id = 'forced-failure' THEN RAISE EXCEPTION 'forced sync failure'; END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER jobs_fail_sync_test BEFORE INSERT ON app.jobs
      FOR EACH ROW EXECUTE FUNCTION app.fail_sync_test();
    `);
    const token = await tokenFor(accountA);
    const response = await mutate(baseUrl, token, jobMutation(1, { entityId: "forced-failure" }));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "internal_error" });
    const counts = await database.query(
      `SELECT
        (SELECT count(*) FROM app.jobs) AS jobs,
        (SELECT count(*) FROM app.sync_operations) AS operations`,
    );
    assert.deepEqual(counts.rows[0], { jobs: "0", operations: "0" });
  });
});
