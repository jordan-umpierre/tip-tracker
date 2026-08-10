import type { RequestHandler } from "express";
import type pg from "pg";

// A fixed-window request limit. Production uses the database-backed store below
// so concurrent Lambda environments share one counter. Tests and local app
// instances can use the in-memory store without needing a database.

export type RateLimitOptions = {
  max: number;
  windowMs: number;
  now?: () => number;
};

type Window = { count: number; resetAt: number };

export type RateLimitStore = {
  consume(key: string, now: number, windowMs: number): Promise<Window>;
};

export function createRateLimiter({
  max,
  now = Date.now,
  store = createInMemoryRateLimitStore(),
  windowMs,
}: RateLimitOptions & { store?: RateLimitStore }): RequestHandler {
  return async (request, response, next) => {
    try {
      const currentTime = now();
      const window = await store.consume(request.ip ?? "unknown", currentTime, windowMs);

      if (window.count > max) {
        const retryAfterSeconds = Math.max(1, Math.ceil((window.resetAt - currentTime) / 1000));
        response.set("Retry-After", String(retryAfterSeconds));
        response.status(429).json({ error: "too_many_requests" });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

function createInMemoryRateLimitStore(): RateLimitStore {
  const windows = new Map<string, Window>();
  let nextSweepAt = 0;

  return {
    async consume(key, currentTime, windowMs) {
      nextSweepAt = sweepExpiredWindows(windows, currentTime, nextSweepAt, windowMs);

      const window = windows.get(key);
      if (!window || currentTime >= window.resetAt) {
        const nextWindow = { count: 1, resetAt: currentTime + windowMs };
        windows.set(key, nextWindow);
        return nextWindow;
      }

      window.count += 1;
      return window;
    },
  };
}

function sweepExpiredWindows(
  windows: Map<string, Window>,
  currentTime: number,
  nextSweepAt: number,
  windowMs: number,
): number {
  if (currentTime < nextSweepAt) return nextSweepAt;

  for (const [windowKey, window] of windows) {
    if (currentTime >= window.resetAt) windows.delete(windowKey);
  }
  return currentTime + windowMs;
}

export function createPostgresRateLimitStore(
  database: Pick<pg.Pool, "query">,
): RateLimitStore {
  return {
    async consume(key, now, windowMs) {
      const windowStart = Math.floor(now / windowMs) * windowMs;
      const result = await database.query<{ request_count: number; window_start_ms: string }>(
        `WITH expired AS (
           DELETE FROM app.rate_limit_windows
           WHERE window_start_ms + $1 <= $2
         )
         INSERT INTO app.rate_limit_windows (client_key, window_start_ms, request_count)
         VALUES ($3, $4, 1)
         ON CONFLICT (client_key) DO UPDATE
         SET window_start_ms = CASE
               WHEN app.rate_limit_windows.window_start_ms + $1 <= $2 THEN $4
               ELSE app.rate_limit_windows.window_start_ms
             END,
             request_count = CASE
               WHEN app.rate_limit_windows.window_start_ms + $1 <= $2 THEN 1
               ELSE app.rate_limit_windows.request_count + 1
             END
         RETURNING request_count, window_start_ms`,
        [windowMs, now, key, windowStart],
      );

      const row = result.rows[0];
      if (!row) throw new Error("Rate limiter did not return its counter");
      return {
        count: row.request_count,
        resetAt: Number(row.window_start_ms) + windowMs,
      };
    },
  };
}
