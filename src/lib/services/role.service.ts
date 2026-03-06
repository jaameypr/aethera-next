import "server-only";

import { connectDB } from "@/lib/db/connection";
import { RoleModel, type IRole } from "@/lib/db/models/role";
import { UserModel } from "@/lib/db/models/user";
import type { PermissionEntry } from "@/lib/api/types";

export async function listAllRoles(): Promise<IRole[]> {
  await connectDB();
  return RoleModel.find().sort({ name: 1 }).lean<IRole[]>();
}

export async function getRoleById(id: string): Promise<IRole | null> {
  await connectDB();
  return RoleModel.findById(id).lean<IRole>();
}

export async function createRole(data: {
  name: string;
  description?: string;
  permissions: PermissionEntry[];
}): Promise<IRole> {
  await connectDB();
  const role = await RoleModel.create({
    name: data.name.toLowerCase(),
    description: data.description || "",
    permissions: data.permissions,
  });
  return role.toObject() as IRole;
}

export async function updateRole(
  id: string,
  patch: {
    name?: string;
    description?: string;
    permissions?: PermissionEntry[];
  },
): Promise<IRole | null> {
  await connectDB();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.toLowerCase();
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.permissions !== undefined) update.permissions = patch.permissions;

  return RoleModel.findByIdAndUpdate(id, update, { new: true }).lean<IRole>();
}

export async function deleteRole(id: string): Promise<void> {
  await connectDB();
  const role = await RoleModel.findById(id);
  if (!role) throw new Error("Role not found");

  // Check if any users have this role assigned
  const usersWithRole = await UserModel.countDocuments({
    roles: role.name,
  });
  if (usersWithRole > 0) {
    throw new Error(
      `Cannot delete role "${role.name}" — it is assigned to ${usersWithRole} user(s)`,
    );
  }

  await RoleModel.findByIdAndDelete(id);
}
