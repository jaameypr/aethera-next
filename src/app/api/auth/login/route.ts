import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { UserModel } from "@/lib/db/models/user";
import { RefreshTokenModel } from "@/lib/db/models/refresh-token";
import { comparePassword } from "@/lib/auth/password";
import { signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import {
  buildAccessCookieOptions,
  buildAccessExpCookieOptions,
  buildRefreshCookieOptions,
} from "@/lib/auth/cookie-options";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { usernameOrEmail, password, remember } = body;

    if (!usernameOrEmail || !password) {
      return NextResponse.json(
        { error: "Username/email and password are required" },
        { status: 400 },
      );
    }

    await connectDB();

    const identifier = usernameOrEmail.toLowerCase();
    const user = await UserModel.findOne({
      $or: [{ username: identifier }, { email: identifier }],
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    if (!user.enabled) {
      return NextResponse.json(
        { error: "Account is disabled" },
        { status: 403 },
      );
    }

    // Create refresh token
    const jti = crypto.randomUUID();
    const { token: accessToken, expiresAt: accessExpiresAt } = await signAccessToken(
      user._id.toString(),
      user.roles,
    );
    const { token: refreshToken, expiresAt: refreshExpiresAt } =
      await signRefreshToken(user._id.toString(), jti);

    await RefreshTokenModel.create({
      userId: user._id,
      jti,
      expiresAt: refreshExpiresAt,
      revoked: false,
    });

    const responseData = {
      accessToken,
      accessExpiresAt: accessExpiresAt.toISOString(),
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
      "access_token_exp",
      accessExpiresAt.toISOString(),
      buildAccessExpCookieOptions(accessExpiresAt),
    );
    response.cookies.set(
      "refresh_token",
      refreshToken,
      buildRefreshCookieOptions({
        persist: remember,
        refreshExpiresAt,
      }),
    );

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
