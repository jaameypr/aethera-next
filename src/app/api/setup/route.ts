import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { UserModel } from "@/lib/db/models/user";
import { RoleModel } from "@/lib/db/models/role";
import { RefreshTokenModel } from "@/lib/db/models/refresh-token";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import {
  buildAccessCookieOptions,
  buildRefreshCookieOptions,
} from "@/lib/auth/cookie-options";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    // Guard: reject if any user already exists
    const userCount = await UserModel.countDocuments();
    if (userCount > 0) {
      return NextResponse.json(
        { error: "Setup already completed" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { username, email, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    // Create admin role if not exists
    let adminRole = await RoleModel.findOne({ name: "admin" });
    if (!adminRole) {
      adminRole = await RoleModel.create({
        name: "admin",
        description: "Full system administrator",
        permissions: [{ name: "*", allow: true }],
      });
    }

    // Create admin user
    const passwordHash = await hashPassword(password);
    const user = await UserModel.create({
      username: username.toLowerCase(),
      email: (email || `${username}@localhost`).toLowerCase(),
      passwordHash,
      enabled: true,
      roles: ["admin"],
      permissions: [],
    });

    // Auto-issue tokens
    const jti = crypto.randomUUID();
    const accessToken = await signAccessToken(
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
  } catch (error) {
    console.error("Setup error:", error);
    if (
      error instanceof Error &&
      error.message.includes("duplicate key")
    ) {
      return NextResponse.json(
        { error: "Username or email already taken" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    await connectDB();
    const userCount = await UserModel.countDocuments();
    return NextResponse.json({ needsSetup: userCount === 0 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
