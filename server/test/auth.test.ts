import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { test } from "node:test";

import { exportJWK, generateKeyPair, SignJWT } from "jose";

import { createAccounts } from "../src/accounts.ts";
import { createApp } from "../src/app.ts";
import { createAccessTokenVerifier } from "../src/auth.ts";
import { withTestDatabase } from "./database.ts";

const migrationUrl = new URL("../migrations/001_initial.sql", import.meta.url);
const issuer = "https://local-auth.example/auth/v1";
const audience = "authenticated";
const accountA = "00000000-0000-4000-8000-000000000001";
const accountB = "00000000-0000-4000-8000-000000000002";

async function listen(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function signToken(
  privateKey: CryptoKey,
  subject: string,
  overrides: { audience?: string; expiresAt?: number; issuer?: string } = {},
) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "local-test-key" })
    .setSubject(subject)
    .setIssuer(overrides.issuer ?? issuer)
    .setAudience(overrides.audience ?? audience)
    .setIssuedAt()
    .setExpirationTime(overrides.expiresAt ?? Math.floor(Date.now() / 1000) + 300)
    .sign(privateKey);
}

test("verified subjects alone control account reads and deletion", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  const signingKeys = await generateKeyPair("RS256");
  const wrongKeys = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(signingKeys.publicKey);
  const jwksServer = createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ keys: [{ ...publicJwk, alg: "RS256", kid: "local-test-key", use: "sig" }] }));
  });
  const jwksBaseUrl = await listen(jwksServer);

  try {
    await withTestDatabase(async (database) => {
      await database.query(migration);
      const verifyAccessToken = createAccessTokenVerifier({
        audience,
        issuer,
        jwksUrl: new URL(jwksBaseUrl),
      });
      const apiServer = createServer(createApp({
        accounts: createAccounts(database),
        verifyAccessToken,
      }));
      const apiBaseUrl = await listen(apiServer);

      try {
        const tokenA = await signToken(signingKeys.privateKey, accountA);
        const tokenB = await signToken(signingKeys.privateKey, accountB);
        const accountResponse = await fetch(`${apiBaseUrl}/v1/me`, {
          headers: { authorization: `Bearer ${tokenA}` },
        });
        assert.equal(accountResponse.status, 200);
        const accountBody = await accountResponse.json() as { createdAt: string; id: string };
        assert.equal(accountBody.id, accountA);
        assert.equal(Number.isNaN(Date.parse(accountBody.createdAt)), false);

        const invalidTokens = [
          await signToken(wrongKeys.privateKey, accountA),
          await signToken(signingKeys.privateKey, accountA, { issuer: "https://wrong.example/auth/v1" }),
          await signToken(signingKeys.privateKey, accountA, { audience: "wrong" }),
          await signToken(signingKeys.privateKey, accountA, { expiresAt: Math.floor(Date.now() / 1000) - 1 }),
        ];

        for (const token of invalidTokens) {
          const response = await fetch(`${apiBaseUrl}/v1/me`, {
            headers: { authorization: `Bearer ${token}` },
          });
          assert.equal(response.status, 401);
          assert.deepEqual(await response.json(), { error: "unauthorized" });
        }

        const missingToken = await fetch(`${apiBaseUrl}/v1/me`);
        assert.equal(missingToken.status, 401);

        await fetch(`${apiBaseUrl}/v1/me`, {
          headers: { authorization: `Bearer ${tokenB}` },
        });
        await database.query(
          `INSERT INTO app.jobs (account_id, id, name, hourly_rate_cents)
           VALUES ($1, '10000000-0000-4000-8000-000000000001', 'Bar', 1500)`,
          [accountA],
        );
        await database.query(
          `INSERT INTO app.shifts
            (account_id, id, job_id, shift_date, duration_seconds, tips_cents, hourly_rate_cents)
           VALUES ($1, '20000000-0000-4000-8000-000000000001',
             '10000000-0000-4000-8000-000000000001', '2026-08-05', 14400, 5000, 1500)`,
          [accountA],
        );
        await database.query(
          `INSERT INTO app.federal_withholding_settings
            (account_id, id, job_id, effective_from, filing_status,
             pay_periods_per_year, step2_checked, step3_credits_cents,
             step4a_other_income_cents, step4b_deductions_cents,
             step4c_extra_withholding_cents, exempt)
           VALUES ($1, '30000000-0000-4000-8000-000000000001',
             '10000000-0000-4000-8000-000000000001', '2026-01-01',
             'single-or-married-filing-separately', 26, false, 0, 0, 0, 0, false)`,
          [accountA],
        );

        const deleteB = await fetch(`${apiBaseUrl}/v1/me`, {
          method: "DELETE",
          headers: {
            authorization: `Bearer ${tokenB}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ userId: accountA }),
        });
        assert.equal(deleteB.status, 204);
        const afterSpoof = await database.query(
          "SELECT id FROM app.accounts ORDER BY id",
        );
        assert.deepEqual(afterSpoof.rows, [{ id: accountA }]);

        const deleteA = await fetch(`${apiBaseUrl}/v1/me`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${tokenA}` },
        });
        assert.equal(deleteA.status, 204);
        const remaining = await database.query(
          `SELECT
            (SELECT count(*) FROM app.accounts) AS accounts,
            (SELECT count(*) FROM app.jobs) AS jobs,
            (SELECT count(*) FROM app.shifts) AS shifts,
            (SELECT count(*) FROM app.federal_withholding_settings) AS settings`,
        );
        assert.deepEqual(remaining.rows[0], {
          accounts: "0",
          jobs: "0",
          shifts: "0",
          settings: "0",
        });
      } finally {
        await close(apiServer);
      }
    });
  } finally {
    await close(jwksServer);
  }
});
