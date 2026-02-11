import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { RefreshTokenModel } from "@/lib/db/models/refresh-token";
import { verifyRefreshToken } from "@/lib/auth/jwt";

export async function POST(req: NextRequest) {
  try {
    let token: string | undefined;

    try {
      const body = await req.json();
      token = body.refreshToken;
    } catch {
      // No body, try cookie
    }

    if (!token) {
      token = req.cookies.get("refresh_token")?.value;
    }

    if (token) {
      try {
        const payload = await verifyRefreshToken(token);
        await connectDB();
        await RefreshTokenModel.findOneAndUpdate(
          { jti: payload.jti },
          { revoked: true },
        );
      } catch {
        // Token already invalid, that's fine
      }
    }

    const response = NextResponse.json({ success: true });
    response.cookies.delete("access_token");
    response.cookies.delete("refresh_token");

    return response;
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json({ success: true });
  }
}
