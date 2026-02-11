"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import * as userService from "@/lib/services/user.service";
import * as roleService from "@/lib/services/role.service";
import type { PermissionEntry } from "@/lib/api/types";

// User actions
export async function createUserAction(payload: {
  username: string;
  email?: string;
  password?: string;
  enabled?: boolean;
  roles?: string[];
  permissions?: PermissionEntry[];
}) {
  await requirePermission("admin.users");
  const result = await userService.createUser(payload);
  revalidatePath("/admin/users");
  return {
    user: JSON.parse(JSON.stringify(result.user)),
    tempPassword: result.tempPassword,
    emailSent: result.emailSent,
  };
}

export async function updateUserAction(
  userId: string,
  payload: {
    username?: string;
    email?: string;
    enabled?: boolean;
    roles?: string[];
    permissions?: PermissionEntry[];
  },
) {
  await requirePermission("admin.users");
  const user = await userService.updateUser(userId, payload);
  revalidatePath("/admin/users");
  return JSON.parse(JSON.stringify(user));
}

export async function deleteUserAction(userId: string) {
  await requirePermission("admin.users");
  await userService.deleteUser(userId);
  revalidatePath("/admin/users");
}

export async function enableUserAction(userId: string) {
  await requirePermission("admin.users");
  await userService.setEnabled(userId, true);
  revalidatePath("/admin/users");
}

export async function disableUserAction(userId: string) {
  await requirePermission("admin.users");
  await userService.setEnabled(userId, false);
  revalidatePath("/admin/users");
}

export async function resetUserPasswordAction(userId: string) {
  await requirePermission("admin.users");
  const result = await userService.resetPassword(userId);
  return result;
}

// Role actions
export async function createRoleAction(payload: {
  name: string;
  description?: string;
  permissions: PermissionEntry[];
}) {
  await requirePermission("admin.roles");
  const role = await roleService.createRole(payload);
  revalidatePath("/admin/roles");
  return JSON.parse(JSON.stringify(role));
}

export async function updateRoleAction(
  roleId: string,
  payload: {
    name?: string;
    description?: string;
    permissions?: PermissionEntry[];
  },
) {
  await requirePermission("admin.roles");
  const role = await roleService.updateRole(roleId, payload);
  revalidatePath("/admin/roles");
  return JSON.parse(JSON.stringify(role));
}

export async function deleteRoleAction(roleId: string) {
  await requirePermission("admin.roles");
  await roleService.deleteRole(roleId);
  revalidatePath("/admin/roles");
}
