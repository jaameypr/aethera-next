"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db/connection";
import { RefreshTokenModel } from "@/lib/db/models/refresh-token";
import { verifyRefreshToken } from "@/lib/auth/jwt";

export async function logoutAction() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("refresh_token")?.value;

  if (refreshToken) {
    try {
      const payload = await verifyRefreshToken(refreshToken);
      await connectDB();
      await RefreshTokenModel.findOneAndUpdate(
        { jti: payload.jti },
        { revoked: true },
      );
    } catch {
      // Token already invalid
    }
  }

  cookieStore.delete("access_token");
  cookieStore.delete("access_token_exp");
  cookieStore.delete("refresh_token");

  redirect("/login");
}
