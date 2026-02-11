import { NextRequest } from "next/server";
import { withPermission } from "@/lib/auth/guards";
import {
  getUserById,
  updateUser,
  deleteUser,
} from "@/lib/services/user.service";
import { errorResponse } from "@/lib/api/errors";

export const GET = withPermission("admin.users", async (_req: NextRequest, { params }) => {
  try {
    const user = await getUserById(params.userId);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }
    return Response.json(user);
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = withPermission("admin.users", async (req: NextRequest, { params }) => {
  try {
    const body = await req.json();
    const user = await updateUser(params.userId, body);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }
    return Response.json(user);
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

export const DELETE = withPermission("admin.users", async (_req: NextRequest, { params }) => {
  try {
    await deleteUser(params.userId);
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
