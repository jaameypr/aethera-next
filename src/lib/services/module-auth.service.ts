import "server-only";

import { SignJWT } from "jose";
import type { Session } from "@/lib/auth/guards";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not configured");
  return new TextEncoder().encode(secret);
}

function getIssuer() {
  return process.env.JWT_ISSUER || "aethera";
}

/* ------------------------------------------------------------------ */
/*  Module auth token payload                                          */
/* ------------------------------------------------------------------ */

export interface ModuleAuthTokenPayload {
  sub: string;
  roles: string[];
  module: string;
  type: "module_auth";
  iss: string;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Generate a short-lived SSO token for launching a module.
 * The token is signed with the same JWT_SECRET so the module can verify it.
 * TTL: 60 seconds (just enough for the redirect flow).
 */
export async function generateModuleToken(
  session: Session,
  moduleId: string,
  username: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    roles: session.roles,
    module: moduleId,
    username,
    type: "module_auth",
  } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuer(getIssuer())
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(getSecret());
}
