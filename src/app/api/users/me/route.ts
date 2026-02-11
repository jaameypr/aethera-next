import { withAuth } from "@/lib/auth/guards";
import { getUserById } from "@/lib/services/user.service";
import { listAllRoles } from "@/lib/services/role.service";
import { errorResponse } from "@/lib/api/errors";

export const GET = withAuth(async (_req, { session }) => {
  try {
    const user = await getUserById(session.userId);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const allRoles = await listAllRoles();
    const userRoles = allRoles.filter((r) =>
      user.roles.includes(r.name),
    );

    return Response.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      enabled: user.enabled,
      roles: userRoles,
      permissions: user.permissions,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
