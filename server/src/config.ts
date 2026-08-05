export type ServerConfig = {
  host: string;
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

  return { host, port };
}
