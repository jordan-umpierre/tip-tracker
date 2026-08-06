import express, { type ErrorRequestHandler, type RequestHandler } from "express";

import type { Accounts } from "./accounts.ts";
import { requireAuth, wasRecentlyPasswordAuthenticated, type VerifyAccessToken } from "./auth.ts";
import type { AuthAdmin } from "./authAdmin.ts";
import { createRateLimiter } from "./rateLimit.ts";
import { createRequestLogger, type RequestLogLine } from "./requestLog.ts";
import { InvalidSyncQueryError, InvalidSyncRequestError, type SyncService } from "./sync.ts";

const JSON_BODY_LIMIT = "32kb";

// D26 pushes one mutation per request, serialized, so a first upload of a
// long shift history is hundreds of legitimate sequential requests from one
// address. The budget has to clear that comfortably while still bounding a
// flood: ten requests a second sustained is far more than a serialized client
// can produce over a real network.
const RATE_LIMIT_MAX = 600;
const RATE_LIMIT_WINDOW_MS = 60_000;
const SYNC_MUTATION_BODY_LIMIT = "10500000b";
const PUBLIC_PARSER_ERRORS = new Map([
  [400, "invalid_json"],
  [413, "body_too_large"],
]);

function errorStatus(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  return Number(error.status);
}

function requireActiveAccount(accounts: Accounts): RequestHandler {
  return async (_request, response, next) => {
    const account = await accounts.findOrCreate(response.locals.auth.subject);
    if (account.deleted) {
      response.status(410).json({ error: "account_deleted" });
      return;
    }
    next();
  };
}

export function createApp(dependencies?: {
  accounts: Accounts;
  authAdmin: AuthAdmin;
  logError?: (error: unknown) => void;
  logRequest?: (line: RequestLogLine) => void;
  now?: () => number;
  readiness: () => Promise<void>;
  sync: SyncService;
  trustProxyHops?: number;
  verifyAccessToken: VerifyAccessToken;
}) {
  const app = express();
  const logError = dependencies?.logError ?? console.error;

  app.disable("x-powered-by");

  // Express derives request.ip from X-Forwarded-For, and it must be told how
  // many entries at the end of that header were written by infrastructure we
  // control. See readTrustProxyHops in config.ts for why this is stated rather
  // than guessed. Zero disables header parsing entirely.
  app.set("trust proxy", dependencies?.trustProxyHops ?? 0);

  // Above everything, including the probe routes and the limiter, so a
  // refused request is still a request that shows up in the log. The logger
  // itself decides that a passing probe is not worth a line.
  app.use(createRequestLogger({ log: dependencies?.logRequest, now: dependencies?.now }));

  // Health and readiness sit above the limiter on purpose. A platform's uptime
  // probe polls from a small set of addresses at a fixed interval, and an
  // instance that answers "429" to its own load balancer gets pulled out of
  // rotation for being healthy.
  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.get("/ready", async (_request, response) => {
    try {
      await dependencies?.readiness();
      if (!dependencies) throw new Error("Application dependencies are unavailable");
      response.json({ status: "ready" });
    } catch {
      response.status(503).json({ error: "not_ready" });
    }
  });

  // Everything past this point costs a token verification, a database round
  // trip, or both, so the limit is applied before any of them rather than per
  // route.
  app.use(createRateLimiter({
    max: RATE_LIMIT_MAX,
    now: dependencies?.now,
    windowMs: RATE_LIMIT_WINDOW_MS,
  }));

  if (dependencies) {
    const requireSyncAccount = requireActiveAccount(dependencies.accounts);
    app.get(
      "/v1/sync/changes",
      requireAuth(dependencies.verifyAccessToken),
      requireSyncAccount,
      async (request, response) => {
        try {
          response.json(await dependencies.sync.listChanges(
            response.locals.auth.subject,
            request.query,
          ));
        } catch (error) {
          if (error instanceof InvalidSyncQueryError) {
            response.status(400).json({ error: "invalid_query" });
            return;
          }
          throw error;
        }
      },
    );

    app.post(
      "/v1/sync/mutations",
      requireAuth(dependencies.verifyAccessToken),
      express.json({ limit: SYNC_MUTATION_BODY_LIMIT, strict: true }),
      requireSyncAccount,
      async (request, response) => {
        try {
          const result = await dependencies.sync.mutate(response.locals.auth.subject, request.body);
          response.status(result.status).json(result.body);
        } catch (error) {
          if (error instanceof InvalidSyncRequestError) {
            response.status(422).json({ error: "invalid_request" });
            return;
          }
          throw error;
        }
      },
    );

    app.use(express.json({ limit: JSON_BODY_LIMIT, strict: true }));

    app.get("/v1/me", requireAuth(dependencies.verifyAccessToken), async (_request, response) => {
      const account = await dependencies.accounts.findOrCreate(response.locals.auth.subject);
      if (account.deleted || !account.created_at) {
        response.status(410).json({ error: "account_deleted" });
        return;
      }
      response.json({ createdAt: account.created_at.toISOString(), id: account.id });
    });

    app.delete("/v1/me", requireAuth(dependencies.verifyAccessToken), async (_request, response) => {
      const claims = response.locals.auth;
      const alreadyDeleted = await dependencies.accounts.isDeleted(claims.subject);
      if (!alreadyDeleted && !wasRecentlyPasswordAuthenticated(claims)) {
        response.status(403).json({ error: "recent_authentication_required" });
        return;
      }

      await dependencies.accounts.markDeleted(claims.subject);
      try {
        await dependencies.authAdmin.deleteIdentity(claims.subject);
      } catch (error) {
        logError(error);
        response.status(503).json({ error: "identity_deletion_pending" });
        return;
      }
      response.status(204).end();
    });
  }

  app.use((_request, response) => {
    response.status(404).json({ error: "not_found" });
  });

  // Express identifies body-parser errors by status. Return one bounded public
  // message and keep parser details and stack traces on the server side.
  const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
    const status = errorStatus(error);
    const publicError = PUBLIC_PARSER_ERRORS.get(status ?? 0);

    if (status && publicError) {
      response.status(status).json({ error: publicError });
      return;
    }

    logError(error);
    response.status(500).json({ error: "internal_error" });
  };

  app.use(handleError);
  return app;
}
