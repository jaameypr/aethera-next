import { NextRequest } from "next/server";
import { withPermission } from "@/lib/auth/guards";
import { listAllRoles, createRole } from "@/lib/services/role.service";
import { errorResponse } from "@/lib/api/errors";

export const GET = withPermission("admin.roles", async () => {
  try {
    const roles = await listAllRoles();
    return Response.json(roles);
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withPermission("admin.roles", async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { name, description, permissions } = body;

    if (!name) {
      return Response.json(
        { error: "Role name is required" },
        { status: 400 },
      );
    }

    const role = await createRole({ name, description, permissions: permissions || [] });
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
