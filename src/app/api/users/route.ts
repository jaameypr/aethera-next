import { NextRequest } from "next/server";
import { withPermission } from "@/lib/auth/guards";
import { listAllUsers, createUser } from "@/lib/services/user.service";
import { errorResponse } from "@/lib/api/errors";

export const GET = withPermission("admin.users", async () => {
  try {
    const users = await listAllUsers();
    return Response.json(users);
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withPermission("admin.users", async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { username, email, password, enabled, roles, permissions } = body;

    if (!username) {
      return Response.json(
        { error: "Username is required" },
        { status: 400 },
      );
    }

    const result = await createUser({
      username,
      email,
      password,
      enabled,
      roles,
      permissions,
    });

    return Response.json({
      user: result.user,
      tempPassword: result.tempPassword,
      emailSent: result.emailSent,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("duplicate key")
    ) {
      return Response.json(
        { error: "Username or email already taken" },
        { status: 409 },
      );
    }
    return errorResponse(error);
  }
});
