// Proves a real Supabase project and database match what this server needs,
// before anything is deployed or built onto a phone.
//
// readConfig already refuses to start on a missing or malformed variable, but
// it only ever looks at the strings. A value can be perfectly well-formed and
// still point at the wrong project, a project whose signing keys this server
// cannot use, or a key that is not allowed to do the one admin job it is here
// for. Those three failures are invisible until a device is in your hand and
// every request comes back 401, which is the worst place to debug them.
//
// Run it with the same environment the deployed server will get:
//
//   npm run check-provider
//
// Every check runs even after an earlier one fails, so one run reports every
// problem instead of making you fix them one at a time.

import pg from "pg";

import { readConfig } from "./config.ts";
import { assertSchemaCurrent } from "./migrations.ts";

const config = readConfig(process.env);
let failed = false;

function pass(message: string) {
  console.log(`ok    ${message}`);
}

function fail(message: string, detail: string) {
  console.error(`FAIL  ${message}\n      ${detail}`);
  failed = true;
}

// Check 1: the signing keys this server can actually verify with.
//
// auth.ts verifies tokens with createRemoteJWKSet, which needs the project to
// sign with an asymmetric key whose public half is published here. A project
// still on the legacy shared HS256 secret has nothing useful to publish, so
// the endpoint answers with an empty key set and every verification fails with
// no hint as to why. Checking the algorithm and not just the reachability is
// the whole point of this one.
try {
  const response = await fetch(config.jwksUrl);
  if (!response.ok) {
    fail("JWKS endpoint", `${config.jwksUrl} answered ${response.status}`);
  } else {
    const keys = readKeys(await response.json());
    const asymmetric = keys.filter((key) => key.alg !== undefined && !key.alg.startsWith("HS"));

    if (keys.length === 0) {
      fail(
        "JWKS endpoint",
        "no keys published. The project is still on the legacy shared JWT secret; " +
          "migrate it to asymmetric signing keys under Auth -> Signing Keys.",
      );
    } else if (asymmetric.length === 0) {
      fail(
        "JWKS endpoint",
        `only symmetric keys published (${keys.map((key) => key.alg).join(", ")}). ` +
          "This server verifies with a public key and cannot use those.",
      );
    } else {
      pass(`JWKS endpoint publishes ${asymmetric.length} asymmetric key(s)`);
    }
  }
} catch (error) {
  fail("JWKS endpoint", `${config.jwksUrl} could not be reached: ${messageOf(error)}`);
}

// The endpoint is public JSON from another system, so nothing about its shape
// is guaranteed. Read it defensively rather than trusting a cast.
function readKeys(body: unknown): { alg?: string }[] {
  if (typeof body !== "object" || body === null || !("keys" in body)) return [];
  const keys = (body as { keys: unknown }).keys;
  if (!Array.isArray(keys)) return [];

  return keys.map((key) => {
    const alg = typeof key === "object" && key !== null && "alg" in key
      ? (key as { alg: unknown }).alg
      : undefined;
    return { alg: typeof alg === "string" ? alg : undefined };
  });
}

// Check 2: the service-role key can do the one thing it is here for.
//
// authAdmin.ts uses this key for exactly one call: deleting an identity when a
// user deletes their account. A publishable key pasted here by mistake looks
// identical in the environment and fails only at that moment, halfway through
// a delete that has already removed the user's cloud rows. Listing one user is
// the cheapest read that proves the same admin privilege.
try {
  const url = new URL("/auth/v1/admin/users?per_page=1", config.supabaseUrl);
  const response = await fetch(url, {
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
    },
  });

  if (response.ok) {
    pass("service-role key is accepted by the Auth admin API");
  } else if (response.status === 401 || response.status === 403) {
    fail(
      "service-role key",
      `Auth admin API answered ${response.status}. The key is not a service-role ` +
        "or secret key, or it belongs to a different project than SUPABASE_URL.",
    );
  } else {
    fail("service-role key", `Auth admin API answered ${response.status}`);
  }
} catch (error) {
  fail("service-role key", `Auth admin API could not be reached: ${messageOf(error)}`);
}

// Check 3: the runtime database is reachable and already migrated.
//
// This is the same assertion startup makes, run here so a missing migration is
// found while you can still fix it, rather than as a container that refuses to
// boot. DATABASE_URL is deliberately the runtime connection, not the migration
// owner, so this also catches a runtime role that cannot read its own schema.
const database = new pg.Client({ connectionString: config.databaseUrl });
try {
  await database.connect();
  await assertSchemaCurrent(database);
  pass("database is reachable and its schema matches this server");
} catch (error) {
  fail("database", messageOf(error));
} finally {
  await database.end().catch(() => {});
}

// A failed connection is often an AggregateError -- Node tried every address
// the host resolved to and collected one failure per attempt. Its own message
// is an empty string, so reporting it directly prints a blank line and tells
// you nothing. Fall back to the nested causes, then to the error name.
function messageOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (error.message) return error.message;

  if (error instanceof AggregateError) {
    const causes = error.errors.map(messageOf).filter(Boolean);
    if (causes.length > 0) return [...new Set(causes)].join("; ");
  }

  return error.name;
}

// The two Supabase Auth settings in README.md -- the recovery template
// containing {{ .Token }} and a minimum password length of 8 or less -- are not
// checked here. Neither is readable with the keys this server holds; they need
// a personal access token against the Management API, which is a human
// credential and does not belong in a deployment environment. Verify those two
// by eye in the dashboard, or catch them in the native acceptance pass.
if (failed) {
  console.error("\nProvider check failed. The server would start but misbehave against this project.");
  process.exitCode = 1;
} else {
  console.log("\nProvider check passed.");
}
