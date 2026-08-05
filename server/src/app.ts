import express, { type ErrorRequestHandler } from "express";

import type { Accounts } from "./accounts.ts";
import { requireAuth, type VerifyAccessToken } from "./auth.ts";

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
  verifyAccessToken: VerifyAccessToken;
}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: JSON_BODY_LIMIT, strict: true }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  if (dependencies) {
    app.get("/v1/me", requireAuth(dependencies.verifyAccessToken), async (_request, response) => {
      const account = await dependencies.accounts.findOrCreate(response.locals.auth.subject);
      response.json({ createdAt: account.created_at.toISOString(), id: account.id });
    });

    app.delete("/v1/me", requireAuth(dependencies.verifyAccessToken), async (_request, response) => {
      await dependencies.accounts.delete(response.locals.auth.subject);
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

    console.error(error);
    response.status(500).json({ error: "internal_error" });
  };

  app.use(handleError);
  return app;
}
