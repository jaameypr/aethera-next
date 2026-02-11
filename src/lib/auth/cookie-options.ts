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
