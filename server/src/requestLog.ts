import type { RequestHandler } from "express";

// One line per finished request, as JSON, on stdout.
//
// Hosts collect stdout and let you search it, so a line that is already
// structured is queryable ("every 429 in the last hour") while a prose line is
// only greppable. This is the whole observability story for now: no metrics
// backend, no tracing, no log library. `console.log` writes JSON perfectly
// well, and a dependency here would buy asynchronous flushing this traffic
// does not need.
//
// What is deliberately not logged: request bodies, query strings,
// Authorization headers, and anything else that could carry a token or a
// user's earnings. The whole point of the server is that it holds financial
// records, and logs are the easiest place to leak them by accident.

const MAX_PATH_LENGTH = 100;

// A platform polls these every few seconds forever. Logging a successful probe
// is thousands of identical lines a day burying the requests that matter, so a
// probe is only written when it fails -- which is the only time it says
// anything.
const PROBE_PATHS = new Set(["/health", "/ready"]);

export type RequestLogLine = {
  account?: string;
  durationMs: number;
  method: string;
  path: string;
  status: number;
};

export function createRequestLogger(options?: {
  log?: (line: RequestLogLine) => void;
  now?: () => number;
}): RequestHandler {
  const write = options?.log ?? ((line: RequestLogLine) => console.log(JSON.stringify(line)));
  const now = options?.now ?? Date.now;

  return (request, response, next) => {
    const startedAt = now();

    // "finish" fires once the last byte is handed to the socket, so the status
    // and the duration are both final by then. Logging on the way in instead
    // would mean never recording how a request ended.
    response.once("finish", () => {
      if (PROBE_PATHS.has(request.path) && response.statusCode < 400) return;

      write({
        // Only present once requireAuth has verified a token. An unauthorized
        // request has no account to attribute, and guessing one from an
        // unverified token would be worse than leaving the field out.
        ...(typeof response.locals.auth?.subject === "string"
          ? { account: response.locals.auth.subject }
          : {}),
        durationMs: now() - startedAt,
        method: request.method,
        // Every real route here is a static path, so this carries no record
        // ids. An unmatched 404 path is whatever a stranger sent, so it is
        // truncated rather than written at whatever length they chose.
        path: request.path.slice(0, MAX_PATH_LENGTH),
        status: response.statusCode,
      });
    });

    next();
  };
}
