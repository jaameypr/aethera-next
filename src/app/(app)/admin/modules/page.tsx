import { listInstalledModules } from "@/lib/services/module-manager.service";
import { ModulesPanel } from "@/components/admin/modules-panel";

export default async function AdminModulesPage() {
  const modules = await listInstalledModules();

  return (
    <ModulesPanel
      initialModules={JSON.parse(JSON.stringify(modules))}
    />
  );
}
