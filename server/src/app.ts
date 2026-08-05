import express, { type ErrorRequestHandler } from "express";

import type { Accounts } from "./accounts.ts";
import { requireAuth, type VerifyAccessToken } from "./auth.ts";

const JSON_BODY_LIMIT = "32kb";

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
    const status = typeof error === "object" && error !== null && "status" in error
      ? Number(error.status)
      : 500;

    if (status === 400 || status === 413) {
      response.status(status).json({ error: status === 413 ? "body_too_large" : "invalid_json" });
      return;
    }

    console.error(error);
    response.status(500).json({ error: "internal_error" });
  };

  app.use(handleError);
  return app;
}
