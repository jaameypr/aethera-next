import "server-only";

import { connectDB } from "@/lib/db/connection";
import { UserModel } from "@/lib/db/models/user";
import { RoleModel } from "@/lib/db/models/role";
import { hasPermission } from "@/lib/permissions";

/**
 * Check whether a user holds a specific permission (via roles or direct grants).
 */
export async function checkPermission(
  userId: string,
  permission: string,
): Promise<boolean> {
  await connectDB();

  const user = await UserModel.findById(userId).lean();
  if (!user) return false;

  const roleDocs = await RoleModel.find({ name: { $in: user.roles } }).lean();
  const rolePermissions = roleDocs.flatMap((r) => r.permissions);

  return hasPermission(user.permissions, rolePermissions, permission);
}
