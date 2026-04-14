import os from "node:os";
import { requireSession } from "@/lib/auth/guards";
import { getUserById } from "@/lib/services/user.service";
import { listAllRoles } from "@/lib/services/role.service";
import { hasPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import type { PermissionEntry } from "@/lib/api/types";
import { getOrchestrator, getDockerClient } from "@/lib/docker/orchestrator";
import { listContainers } from "@pruefertit/docker-orchestrator";
import { AdminDashboardClient } from "@/components/admin/admin-dashboard";
import { getServerT } from "@/lib/i18n/server";

export default async function AdminDashboardPage() {
  const session = await requireSession();
  const user = await getUserById(session.userId);
  if (!user) redirect("/login");

  const { t } = await getServerT();

  const allRoles = await listAllRoles();
  const userRoles = allRoles.filter((r) => user.roles.includes(r.name));
  const rolePermissions: PermissionEntry[] = userRoles.flatMap(
    (r) => r.permissions,
  );

  const canSystem =
    hasPermission(user.permissions, rolePermissions, "admin.system") ||
    hasPermission(user.permissions, rolePermissions, "admin.users");

  if (!canSystem) redirect("/unauthorized");

  // Gather system data server-side
  let dockerHealth = null;
  let containers: unknown[] = [];
  try {
    const [orch, docker] = await Promise.all([
      getOrchestrator(),
      getDockerClient(),
    ]);
    dockerHealth = orch.health();
    containers = await listContainers(docker, true);
  } catch {
    // Docker may not be available in dev
  }

  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  const systemData = {
    docker: dockerHealth,
    memory: { total: totalMem, free: freeMem, used: totalMem - freeMem },
    containers: JSON.parse(JSON.stringify(containers)),
    containerCount: {
      total: containers.length,
      running: (containers as { state: string }[]).filter(
        (c) => c.state === "running",
      ).length,
    },
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-sm text-zinc-500">
          {t("admin.subtitle")}
        </p>
      </div>
      <AdminDashboardClient data={systemData} />
    </div>
  );
}
