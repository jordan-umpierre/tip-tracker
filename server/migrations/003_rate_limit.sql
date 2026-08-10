CREATE TABLE app.rate_limit_windows (
  client_key text PRIMARY KEY CHECK (client_key <> ''),
  window_start_ms bigint NOT NULL CHECK (window_start_ms >= 0),
  request_count integer NOT NULL CHECK (request_count > 0)
);
