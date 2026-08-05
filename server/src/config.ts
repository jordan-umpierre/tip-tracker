export type ServerConfig = {
  audience: string;
  databaseUrl: string;
  host: string;
  issuer: string;
  jwksUrl: URL;
  port: number;
  serviceRoleKey: string;
  supabaseUrl: URL;
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

  return {
    audience,
    databaseUrl: databaseUrl.toString(),
    host,
    issuer,
    jwksUrl,
    port,
    serviceRoleKey,
    supabaseUrl,
  };
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
