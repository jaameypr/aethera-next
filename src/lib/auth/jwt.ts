import { SignJWT, jwtVerify } from "jose";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not configured");
  return new TextEncoder().encode(secret);
}

function getIssuer() {
  return process.env.JWT_ISSUER || "aethera";
}

function parseTTL(ttl: string): number {
  const match = ttl.match(/^(\d+)(m|h|d)$/);
  if (!match) throw new Error(`Invalid TTL format: ${ttl}`);
  const num = parseInt(match[1]);
  switch (match[2]) {
    case "m":
      return num * 60;
    case "h":
      return num * 3600;
    case "d":
      return num * 86400;
    default:
      throw new Error(`Invalid TTL unit: ${match[2]}`);
  }
}

export interface AccessTokenPayload {
  sub: string;
  roles: string[];
  iss: string;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  iss: string;
  type: "refresh";
}

export async function signAccessToken(
  userId: string,
  roles: string[],
): Promise<string> {
  const ttl = process.env.JWT_ACCESS_TTL || "15m";
  const expiresIn = parseTTL(ttl);

  return new SignJWT({ roles: Array.from(roles), type: "access" } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(getIssuer())
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
    .sign(getSecret());
}

export async function signRefreshToken(
  userId: string,
  jti: string,
): Promise<{ token: string; expiresAt: Date }> {
  const ttl = process.env.JWT_REFRESH_TTL || "7d";
  const expiresIn = parseTTL(ttl);
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  const token = await new SignJWT({ jti, type: "refresh" } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(getIssuer())
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getSecret());

  return { token, expiresAt };
}

export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    issuer: getIssuer(),
  });

  if (payload.type !== "access") {
    throw new Error("Invalid token type");
  }

  return payload as unknown as AccessTokenPayload;
}

export async function verifyRefreshToken(
  token: string,
): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    issuer: getIssuer(),
  });

  if (payload.type !== "refresh") {
    throw new Error("Invalid token type");
  }

  return payload as unknown as RefreshTokenPayload;
}
