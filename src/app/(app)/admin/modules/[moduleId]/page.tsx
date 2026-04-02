import { getInstalledModule } from "@/lib/services/module-manager.service";
import { notFound } from "next/navigation";
import { ModuleDetailPanel } from "@/components/admin/module-detail-panel";

export default async function ModuleDetailPage(
  props: { params: Promise<{ moduleId: string }> },
) {
  const { moduleId } = await props.params;
  const mod = await getInstalledModule(moduleId);

  if (!mod) notFound();

  return (
    <ModuleDetailPanel
      module={JSON.parse(JSON.stringify(mod))}
    />
  );
}
