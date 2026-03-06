import { requireSession } from "@/lib/auth/guards";
import { getUserById } from "@/lib/services/user.service";
import { listAllRoles } from "@/lib/services/role.service";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import type { PermissionEntry } from "@/lib/api/types";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const user = await getUserById(session.userId);
  if (!user) redirect("/login");

  const allRoles = await listAllRoles();
  const userRoles = allRoles.filter((r) => user.roles.includes(r.name));
  const rolePermissions: PermissionEntry[] = userRoles.flatMap(
    (r) => r.permissions,
  );

  const hasAdmin = hasPermission(
    user.permissions,
    rolePermissions,
    "admin.users",
  ) || hasPermission(
    user.permissions,
    rolePermissions,
    "admin.roles",
  ) || hasPermission(
    user.permissions,
    rolePermissions,
    "admin.system",
  );

  if (!hasAdmin) {
    redirect("/unauthorized");
  }

  return <>{children}</>;
}
