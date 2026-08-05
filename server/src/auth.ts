import type { RequestHandler } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

export type AccessTokenClaims = {
  passwordAuthenticatedAt: number | null;
  subject: string;
};

export type VerifyAccessToken = (token: string) => Promise<AccessTokenClaims>;

export function createAccessTokenVerifier(options: {
  audience: string;
  issuer: string;
  jwksUrl: URL;
}): VerifyAccessToken {
  const jwks = createRemoteJWKSet(options.jwksUrl);

  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, {
      audience: options.audience,
      issuer: options.issuer,
    });

    if (!payload.sub) throw new Error("Access token is missing sub");
    const passwordAuthenticatedAt = latestPasswordAuthentication(payload.amr);
    return { passwordAuthenticatedAt, subject: payload.sub };
  };
}

function latestPasswordAuthentication(value: unknown) {
  if (!Array.isArray(value)) return null;
  const timestamps: number[] = [];
  for (const entry of value) {
    const timestamp = passwordTimestamp(entry);
    if (timestamp !== null) timestamps.push(timestamp);
  }
  return timestamps.length === 0 ? null : Math.max(...timestamps);
}

function passwordTimestamp(value: unknown) {
  if (readProperty(value, "method") !== "password") return null;
  const timestamp = readProperty(value, "timestamp");
  return typeof timestamp === "number" ? timestamp : null;
}

function readProperty(value: unknown, key: string) {
  if (typeof value !== "object" || value === null) return undefined;
  return key in value ? value[key as keyof typeof value] : undefined;
}

export function wasRecentlyPasswordAuthenticated(
  claims: AccessTokenClaims,
  now = Date.now(),
) {
  if (claims.passwordAuthenticatedAt === null) return false;
  const age = Math.floor(now / 1000) - claims.passwordAuthenticatedAt;
  return age >= 0 && age <= 5 * 60;
}

export function requireAuth(verifyAccessToken: VerifyAccessToken): RequestHandler {
  return async (request, response, next) => {
    const authorization = request.get("authorization");
    const match = authorization?.match(/^Bearer ([^\s]+)$/);

    if (!match) {
      response.status(401).json({ error: "unauthorized" });
      return;
    }

    try {
      response.locals.auth = await verifyAccessToken(match[1]);
      next();
    } catch {
      response.status(401).json({ error: "unauthorized" });
    }
  };
}
