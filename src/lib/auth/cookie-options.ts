import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

const isProduction = process.env.NODE_ENV === "production";

export function buildAccessCookieOptions(): Partial<ResponseCookie> {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
  };
}

/** Non-httpOnly cookie that exposes only the access token's expiry time to client JS. */
export function buildAccessExpCookieOptions(
  expiresAt: Date,
): Partial<ResponseCookie> {
  return {
    httpOnly: false,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  };
}

export function buildRefreshCookieOptions(opts?: {
  persist?: boolean;
  refreshExpiresAt?: Date;
}): Partial<ResponseCookie> {
  const base: Partial<ResponseCookie> = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
  };

  if (opts?.persist && opts?.refreshExpiresAt) {
    const maxAge = Math.floor(
      (opts.refreshExpiresAt.getTime() - Date.now()) / 1000,
    );
    base.maxAge = maxAge > 0 ? maxAge : 0;
  }

  return base;
}
