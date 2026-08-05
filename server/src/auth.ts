import type { RequestHandler } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

export type AccessTokenClaims = {
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
    return { subject: payload.sub };
  };
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
