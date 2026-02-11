import { NextRequest } from "next/server";
import { withPermission } from "@/lib/auth/guards";
import {
  getRoleById,
  updateRole,
  deleteRole,
} from "@/lib/services/role.service";
import { errorResponse } from "@/lib/api/errors";

export const GET = withPermission("admin.roles", async (_req: NextRequest, { params }) => {
  try {
    const role = await getRoleById(params.roleId);
    if (!role) {
      return Response.json({ error: "Role not found" }, { status: 404 });
    }
    return Response.json(role);
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = withPermission("admin.roles", async (req: NextRequest, { params }) => {
  try {
    const body = await req.json();
    const role = await updateRole(params.roleId, body);
    if (!role) {
      return Response.json({ error: "Role not found" }, { status: 404 });
    }
    return Response.json(role);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("duplicate key")
    ) {
      return Response.json(
        { error: "Role name already taken" },
        { status: 409 },
      );
    }
    return errorResponse(error);
  }
});

export const DELETE = withPermission("admin.roles", async (_req: NextRequest, { params }) => {
  try {
    await deleteRole(params.roleId);
    return Response.json({ success: true });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Cannot delete role")
    ) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return errorResponse(error);
  }
});
