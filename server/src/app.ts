import express, { type ErrorRequestHandler } from "express";

import type { Accounts } from "./accounts.ts";
import { requireAuth, wasRecentlyPasswordAuthenticated, type VerifyAccessToken } from "./auth.ts";
import type { AuthAdmin } from "./authAdmin.ts";

const JSON_BODY_LIMIT = "32kb";
const PUBLIC_PARSER_ERRORS = new Map([
  [400, "invalid_json"],
  [413, "body_too_large"],
]);

function errorStatus(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  return Number(error.status);
}

export function createApp(dependencies?: {
  accounts: Accounts;
  authAdmin: AuthAdmin;
  logError?: (error: unknown) => void;
  readiness: () => Promise<void>;
  verifyAccessToken: VerifyAccessToken;
}) {
  const app = express();
  const logError = dependencies?.logError ?? console.error;

  app.disable("x-powered-by");
  app.use(express.json({ limit: JSON_BODY_LIMIT, strict: true }));

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

  if (dependencies) {
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
