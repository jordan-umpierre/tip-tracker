import type { RequestHandler } from "express";

// A fixed-window request limit, counted in this process's memory.
//
// ponytail: in-memory and per-process, which is exactly right for the one
// instance this API runs as and wrong the moment it runs as two -- each would
// then allow the full budget on its own. The upgrade path is a shared counter
// (Postgres or Redis) behind this same interface, not a bigger Map.
//
// Fixed window rather than a sliding one because the failure it has to prevent
// is a flood, not a precisely fair rate. A client can send up to double the
// budget across a window boundary; that is a known and acceptable edge.

export type RateLimitOptions = {
  max: number;
  windowMs: number;
  // Injected so the tests can move time without sleeping.
  now?: () => number;
};

type Window = { count: number; resetAt: number };

export function createRateLimiter({ max, windowMs, now = Date.now }: RateLimitOptions): RequestHandler {
  const windows = new Map<string, Window>();
  let nextSweepAt = now() + windowMs;

  return (request, response, next) => {
    const currentTime = now();

    // Without this the map grows once per distinct client address and never
    // shrinks, which turns the limiter itself into the memory exhaustion it
    // was added to prevent. One pass per window is cheap and bounded.
    if (currentTime >= nextSweepAt) {
      for (const [key, window] of windows) {
        if (currentTime >= window.resetAt) windows.delete(key);
      }
      nextSweepAt = currentTime + windowMs;
    }

    // request.ip is only trustworthy because app.ts sets "trust proxy" to the
    // exact number of proxies in front of this server. Trusting the header
    // blindly would let any client pick its own bucket by sending an
    // X-Forwarded-For, which is a rate limit that limits nobody.
    const key = request.ip ?? "unknown";
    const window = windows.get(key);

    if (!window || currentTime >= window.resetAt) {
      windows.set(key, { count: 1, resetAt: currentTime + windowMs });
      next();
      return;
    }

    window.count += 1;
    if (window.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((window.resetAt - currentTime) / 1000));
      response.set("Retry-After", String(retryAfterSeconds));
      response.status(429).json({ error: "too_many_requests" });
      return;
    }

    next();
  };
}
