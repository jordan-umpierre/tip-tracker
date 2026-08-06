export type ServerConfig = {
  audience: string;
  databaseUrl: string;
  host: string;
  issuer: string;
  jwksUrl: URL;
  port: number;
  serviceRoleKey: string;
  supabaseUrl: URL;
  trustProxyHops: number;
};

export function readConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const host = env.HOST?.trim() || "0.0.0.0";
  const port = readPort(env.PORT);
  const databaseUrl = requiredUrl(env.DATABASE_URL, "DATABASE_URL", ["postgres:", "postgresql:"]);
  const issuer = requiredUrl(env.SUPABASE_ISSUER, "SUPABASE_ISSUER", ["https:"]).toString().replace(/\/$/, "");
  const jwksUrl = requiredUrl(env.SUPABASE_JWKS_URL, "SUPABASE_JWKS_URL", ["https:"]);
  const audience = requiredText(env.SUPABASE_AUDIENCE, "SUPABASE_AUDIENCE");
  const serviceRoleKey = requiredText(env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = requiredUrl(env.SUPABASE_URL, "SUPABASE_URL", ["https:"]);
  const trustProxyHops = readTrustProxyHops(env.TRUST_PROXY_HOPS);

  return {
    audience,
    databaseUrl: databaseUrl.toString(),
    host,
    issuer,
    jwksUrl,
    port,
    serviceRoleKey,
    supabaseUrl,
    trustProxyHops,
  };
}

// How many proxies sit between the internet and this process. The rate limiter
// buckets by client address, and the address is only correct if Express is
// told exactly how far back in X-Forwarded-For to look.
//
// Zero means nothing is in front, which is right for local development and
// wrong for every hosted deployment: behind an unaccounted-for proxy every
// request appears to come from the proxy, so all traffic shares one bucket and
// the limiter throttles everybody at once. Guessing high is the other failure
// -- trusting a hop that is not there lets a client forge the header and pick
// its own bucket. So it is stated per deployment rather than inferred.
function readTrustProxyHops(value: string | undefined) {
  const hops = Number(valueOrDefault(value, "0"));
  if (!Number.isInteger(hops) || hops < 0 || hops > 10) {
    throw new Error("TRUST_PROXY_HOPS must be an integer from 0 through 10");
  }
  return hops;
}

function readPort(value: string | undefined) {
  const text = valueOrDefault(value, "3000");
  const port = Number(text);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer from 1 through 65535");
  }
  return port;
}

function valueOrDefault(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function requiredText(value: string | undefined, name: string) {
  const text = value?.trim();
  if (!text) throw new Error(`${name} is required`);
  return text;
}

function requiredUrl(value: string | undefined, name: string, protocols: string[]) {
  const text = requiredText(value, name);

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`${name} must use ${protocols.join(" or ")}`);
  }
  return parsed;
}
