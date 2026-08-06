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

    if (!isCanonicalUuid(payload.sub)) throw new Error("Access token sub is not a canonical UUID");
    const passwordAuthenticatedAt = latestPasswordAuthentication(payload.amr);
    return { passwordAuthenticatedAt, subject: payload.sub };
  };
}

// Reads the most recent password login out of the token's amr claim.
//
// This is the one place in the server that is tied to Supabase specifically.
// Supabase writes amr as a list of {method, timestamp} objects, which is what
// lets DELETE /v1/me demand a password login from the last five minutes. Plain
// OIDC writes amr as a list of strings with no timestamps at all, so against
// most other providers every entry here is unreadable and this returns null.
// That fails closed -- account deletion becomes impossible rather than
// unguarded -- but it is silent, so anyone swapping auth providers has to
// replace the reauthentication signal here, not just repoint the JWKS URL.
function latestPasswordAuthentication(value: unknown) {
  if (!Array.isArray(value)) return null;
  const timestamp = Math.max(...value.map(passwordTimestamp));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function passwordTimestamp(value: unknown) {
  if (readProperty(value, "method") !== "password") return Number.NEGATIVE_INFINITY;
  const timestamp = readProperty(value, "timestamp");
  return typeof timestamp === "number" ? timestamp : Number.NEGATIVE_INFINITY;
}

function readProperty(value: unknown, key: string) {
  if (typeof value !== "object" || value === null) return undefined;
  return key in value ? value[key as keyof typeof value] : undefined;
}

function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
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
