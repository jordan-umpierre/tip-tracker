import express, { type ErrorRequestHandler } from "express";

const JSON_BODY_LIMIT = "32kb";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: JSON_BODY_LIMIT, strict: true }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

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
