"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import * as moduleManager from "@/lib/services/module-manager.service";
import * as moduleRegistry from "@/lib/services/module-registry.service";

export async function getModuleCatalogAction() {
  await requirePermission("module.manage");
  const catalog = await moduleRegistry.getModuleCatalog();
  return JSON.parse(JSON.stringify(catalog));
}

export async function getInstalledModulesAction() {
  await requirePermission("module.access");
  const modules = await moduleManager.listInstalledModules();
  return JSON.parse(JSON.stringify(modules));
}

export async function installModuleAction(payload: {
  moduleId: string;
  version: string;
  config?: Record<string, string>;
}) {
  const session = await requirePermission("module.manage");
  const result = await moduleManager.installModule(
    payload.moduleId,
    payload.version,
    session.userId,
    payload.config,
  );
  revalidatePath("/admin/modules");
  return JSON.parse(JSON.stringify(result));
}

export async function uninstallModuleAction(moduleId: string) {
  await requirePermission("module.manage");
  await moduleManager.uninstallModule(moduleId);
  revalidatePath("/admin/modules");
}

export async function startModuleAction(moduleId: string) {
  await requirePermission("module.manage");
  const result = await moduleManager.startModule(moduleId);
  revalidatePath("/admin/modules");
  return JSON.parse(JSON.stringify(result));
}

export async function stopModuleAction(moduleId: string) {
  await requirePermission("module.manage");
  const result = await moduleManager.stopModule(moduleId);
  revalidatePath("/admin/modules");
  return JSON.parse(JSON.stringify(result));
}

export async function updateModuleAction(payload: {
  moduleId: string;
  version: string;
}) {
  await requirePermission("module.manage");
  const result = await moduleManager.updateModule(
    payload.moduleId,
    payload.version,
  );
  revalidatePath("/admin/modules");
  return JSON.parse(JSON.stringify(result));
}

export async function updateModuleConfigAction(
  moduleId: string,
  config: Record<string, string>,
) {
  await requirePermission("module.manage");
  const result = await moduleManager.updateModuleConfig(moduleId, config);
  revalidatePath("/admin/modules");
  return JSON.parse(JSON.stringify(result));
}

export async function checkModuleHealthAction(moduleId: string) {
  await requirePermission("module.access");
  return moduleManager.checkModuleHealth(moduleId);
}
