import type { PermissionEntry } from "@/lib/api/types";

export function hasPermission(
  userPermissions: PermissionEntry[],
  rolePermissions: PermissionEntry[],
  permName: string,
): boolean {
  // Merge: user-level overrides role-level
  const merged = mergePermissions(rolePermissions, userPermissions);

  // Check exact match
  const exact = merged.find((p) => p.name === permName);
  if (exact) return exact.allow;

  // Check wildcard
  const wildcard = merged.find((p) => p.name === "*");
  if (wildcard) return wildcard.allow;

  // Check scoped wildcard (e.g., "project.*" matches "project.read")
  const parts = permName.split(".");
  for (let i = parts.length - 1; i > 0; i--) {
    const pattern = parts.slice(0, i).join(".") + ".*";
    const scoped = merged.find((p) => p.name === pattern);
    if (scoped) return scoped.allow;
  }

  return false;
}

export function hasAnyPermission(
  userPermissions: PermissionEntry[],
  rolePermissions: PermissionEntry[],
  names: string[],
): boolean {
  return names.some((n) => hasPermission(userPermissions, rolePermissions, n));
}

export function hasScopedPermission(
  userPermissions: PermissionEntry[],
  rolePermissions: PermissionEntry[],
  pattern: string,
): boolean {
  return hasPermission(userPermissions, rolePermissions, pattern);
}

function mergePermissions(
  rolePerms: PermissionEntry[],
  userPerms: PermissionEntry[],
): PermissionEntry[] {
  const map = new Map<string, PermissionEntry>();
  for (const p of rolePerms) {
    map.set(p.name, p);
  }
  // User-level overrides role-level
  for (const p of userPerms) {
    map.set(p.name, p);
  }
  return Array.from(map.values());
}
