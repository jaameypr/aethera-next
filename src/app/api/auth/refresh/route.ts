import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { UserModel } from "@/lib/db/models/user";
import { RefreshTokenModel } from "@/lib/db/models/refresh-token";
import { verifyRefreshToken, signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import {
  buildAccessCookieOptions,
  buildRefreshCookieOptions,
} from "@/lib/auth/cookie-options";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { refreshToken: token } = body;

    if (!token) {
      // Try reading from cookie
      const cookieToken = req.cookies.get("refresh_token")?.value;
      if (!cookieToken) {
        return NextResponse.json(
          { error: "Refresh token required" },
          { status: 400 },
        );
      }
      return handleRefresh(cookieToken);
    }

    return handleRefresh(token);
  } catch (error) {
    console.error("Refresh error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

async function handleRefresh(token: string) {
  let payload;
  try {
    payload = await verifyRefreshToken(token);
  } catch {
    return NextResponse.json(
      { error: "Invalid refresh token" },
      { status: 401 },
    );
  }

  await connectDB();

  // Check token in DB
  const tokenDoc = await RefreshTokenModel.findOne({
    jti: payload.jti,
    revoked: false,
  });

  if (!tokenDoc || tokenDoc.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "Refresh token expired or revoked" },
      { status: 401 },
    );
  }

  // Revoke old token
  tokenDoc.revoked = true;
  await tokenDoc.save();

  // Get user
  const user = await UserModel.findById(payload.sub);
  if (!user || !user.enabled) {
    return NextResponse.json(
      { error: "User not found or disabled" },
      { status: 401 },
    );
  }

  // Create new tokens
  const newJti = crypto.randomUUID();
  const accessToken = await signAccessToken(user._id.toString(), user.roles);
  const { token: refreshToken, expiresAt: refreshExpiresAt } =
    await signRefreshToken(user._id.toString(), newJti);

  await RefreshTokenModel.create({
    userId: user._id,
    jti: newJti,
    expiresAt: refreshExpiresAt,
    revoked: false,
  });

  const responseData = {
    accessToken,
    refreshToken,
    refreshExpiresAt: refreshExpiresAt.toISOString(),
    userId: user._id.toString(),
    username: user.username,
    email: user.email,
    roles: user.roles,
  };

  const response = NextResponse.json(responseData);

  response.cookies.set(
    "access_token",
    accessToken,
    buildAccessCookieOptions(),
  );
  response.cookies.set(
    "refresh_token",
    refreshToken,
    buildRefreshCookieOptions({ persist: true, refreshExpiresAt }),
  );

  return response;
}
