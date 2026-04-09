import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { buildAccessCookieOptions } from "@/lib/auth/cookie-options";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/setup",
  "/unauthorized",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/public/")) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname.startsWith("/api/setup")) return true;
  if (pathname.startsWith("/api/modules/") && pathname.endsWith("/health")) return true;
  if (pathname === "/api/backups/callback") return true;
  if (pathname.startsWith("/api/discord/internal/")) return true;
  if (pathname.startsWith("/api/discord/callback/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico") return true;
  return false;
}

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not configured");
  return new TextEncoder().encode(secret);
}

async function verifyToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("access_token")?.value;
  const refreshToken = request.cookies.get("refresh_token")?.value;

  // Valid access token → continue
  if (accessToken && (await verifyToken(accessToken))) {
    return NextResponse.next();
  }

  // Expired access token but valid refresh token → call refresh endpoint
  if (refreshToken) {
    try {
      const refreshUrl = new URL("/api/auth/refresh", request.url);
      const refreshResponse = await fetch(refreshUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (refreshResponse.ok) {
        const data = await refreshResponse.json();

        // Forward the new access token into the request so that server
        // components (e.g. requireSession in the layout) read the fresh
        // token in the same render cycle, not the expired one.
        const existingCookies = request.headers.get("cookie") ?? "";
        const filtered = existingCookies
          .split("; ")
          .filter((c) => !c.startsWith("access_token="))
          .join("; ");
        const updatedCookies = filtered
          ? `${filtered}; access_token=${data.accessToken}`
          : `access_token=${data.accessToken}`;
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set("cookie", updatedCookies);

        const response = NextResponse.next({ request: { headers: requestHeaders } });

        response.cookies.set("access_token", data.accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
        });
        if (data.accessExpiresAt) {
          const accessExpiresAt = new Date(data.accessExpiresAt);
          response.cookies.set(
            "access_token_exp",
            data.accessExpiresAt,
            buildAccessCookieOptions(accessExpiresAt),
          );
        }
        response.cookies.set("refresh_token", data.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
        });

        return response;
      }
    } catch {
      // Refresh failed, redirect to login
    }
  }

  // No valid tokens → redirect to login
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
