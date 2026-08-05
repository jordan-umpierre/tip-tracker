export type ServerConfig = {
  audience: string;
  databaseUrl: string;
  host: string;
  issuer: string;
  jwksUrl: URL;
  port: number;
};

export function readConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const host = env.HOST?.trim() || "0.0.0.0";
  const portText = env.PORT?.trim() || "3000";

  if (!/^\d+$/.test(portText)) {
    throw new Error("PORT must be an integer from 1 through 65535");
  }

  const port = Number(portText);
  if (port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer from 1 through 65535");
  }

  const databaseUrl = requiredUrl(env.DATABASE_URL, "DATABASE_URL", ["postgres:", "postgresql:"]);
  const issuer = requiredUrl(env.SUPABASE_ISSUER, "SUPABASE_ISSUER", ["https:"]).toString().replace(/\/$/, "");
  const jwksUrl = requiredUrl(env.SUPABASE_JWKS_URL, "SUPABASE_JWKS_URL", ["https:"]);
  const audience = env.SUPABASE_AUDIENCE?.trim();
  if (!audience) throw new Error("SUPABASE_AUDIENCE is required");

  return { audience, databaseUrl: databaseUrl.toString(), host, issuer, jwksUrl, port };
}

function requiredUrl(value: string | undefined, name: string, protocols: string[]) {
  if (!value?.trim()) throw new Error(`${name} is required`);

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`${name} must use ${protocols.join(" or ")}`);
  }
  return parsed;
}
