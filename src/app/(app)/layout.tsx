export const dynamic = "force-dynamic";

import { requireSession } from "@/lib/auth/guards";
import { getUserById } from "@/lib/services/user.service";
import { listAllRoles } from "@/lib/services/role.service";
import { listProjects } from "@/lib/services/project.service";
import { getModuleSidebarItems } from "@/lib/services/module-manager.service";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { TokenRefresher } from "@/components/auth/token-refresher";
import { hasAnyPermission } from "@/lib/permissions";
import type { CurrentUserResponse, PermissionEntry } from "@/lib/api/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const user = await getUserById(session.userId);
  if (!user) redirect("/login");

  const [allRoles, projectDocs] = await Promise.all([
    listAllRoles(),
    listProjects(session.userId),
  ]);
  const userRoles = allRoles.filter((r) => user.roles.includes(r.name));
  const rolePermissions: PermissionEntry[] = userRoles.flatMap((r) => r.permissions);

  const isAdmin = hasAnyPermission(user.permissions, rolePermissions, [
    "admin.users",
    "admin.roles",
    "admin.system",
    "admin.mail",
  ]);

  const moduleSidebar = isAdmin ? await getModuleSidebarItems().catch(() => []) : [];
  const projects = projectDocs.map((p) => ({
    _id: p._id.toString(),
    key: p.key,
    name: p.name,
  }));

  const currentUser: CurrentUserResponse = {
    _id: user._id.toString(),
    username: user.username,
    email: user.email,
    enabled: user.enabled,
    roles: userRoles.map((r) => ({
      _id: r._id.toString(),
      name: r.name,
      description: r.description,
      permissions: r.permissions,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    permissions: user.permissions,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };

  return (
    <AppShell
      currentUser={currentUser}
      projects={projects}
      moduleItems={moduleSidebar}
      isAdmin={isAdmin}
    >
      <TokenRefresher />
      {children}
    </AppShell>
  );
}
