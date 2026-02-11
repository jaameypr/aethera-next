import type { IPermission } from "@/lib/db/models/user";
import type { IRole } from "@/lib/db/models/role";

export function hasPermission(
  userPermissions: IPermission[],
  roleDocs: IRole[],
  permName: string,
): boolean {
  const rolePermissions = roleDocs.flatMap((r) => r.permissions);
  const merged = mergePermissions(rolePermissions, userPermissions);

  // Check exact match
  const exact = merged.find((p) => p.name === permName);
  if (exact) return exact.allow;

  // Check wildcard
  const wildcard = merged.find((p) => p.name === "*");
  if (wildcard) return wildcard.allow;

  // Check scoped wildcard
  const parts = permName.split(".");
  for (let i = parts.length - 1; i > 0; i--) {
    const pattern = parts.slice(0, i).join(".") + ".*";
    const scoped = merged.find((p) => p.name === pattern);
    if (scoped) return scoped.allow;
  }

  return false;
}

export function hasAnyPermission(
  userPermissions: IPermission[],
  roleDocs: IRole[],
  names: string[],
): boolean {
  return names.some((n) => hasPermission(userPermissions, roleDocs, n));
}

export function hasScopedPermission(
  userPermissions: IPermission[],
  roleDocs: IRole[],
  pattern: string,
): boolean {
  return hasPermission(userPermissions, roleDocs, pattern);
}

function mergePermissions(
  rolePerms: IPermission[],
  userPerms: IPermission[],
): IPermission[] {
  const map = new Map<string, IPermission>();
  for (const p of rolePerms) {
    map.set(p.name, p);
  }
  for (const p of userPerms) {
    map.set(p.name, p);
  }
  return Array.from(map.values());
}
