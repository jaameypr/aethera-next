"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "sonner";
import {
  Package,
  Download,
  Trash2,
  Play,
  Square,
  RefreshCw,
  ExternalLink,
  ArrowUpCircle,
  Loader2,
} from "lucide-react";
import type { InstalledModuleResponse, ModuleCatalogEntry } from "@/lib/api/types";
import { getModuleCatalogAction,
  installModuleAction,
  uninstallModuleAction,
  startModuleAction,
  stopModuleAction,
  updateModuleAction,
} from "@/app/(app)/actions/modules";
import { useLocale } from "@/context/locale-context";

interface ModulesPanelProps {
  initialModules: InstalledModuleResponse[];
}

function statusVariant(status: string) {
  switch (status) {
    case "running":
      return "running" as const;
    case "stopped":
    case "error":
      return "stopped" as const;
    case "installing":
    case "updating":
    case "uninstalling":
      return "default" as const;
    default:
      return "default" as const;
  }
}

export function ModulesPanel({ initialModules }: ModulesPanelProps) {
  const [modules, setModules] = useState(initialModules);
  const [catalog, setCatalog] = useState<ModuleCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmUninstall, setConfirmUninstall] =
    useState<InstalledModuleResponse | null>(null);
  const { t } = useLocale();

  const loadCatalog = async () => {
    setCatalogLoading(true);
    try {
      const data = await getModuleCatalogAction();
      setCatalog(data);
    } catch (err) {
      toast.error(
        `${t("admin.modules.loadCatalogError")}: ${err instanceof Error ? err.message : t("common.error")}`,
      );
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  const handleInstall = async (moduleId: string, version: string) => {
    setActionLoading(moduleId);
    try {
      const result = await installModuleAction({ moduleId, version });
      setModules((prev) => [...prev, result]);
      toast.success(t("admin.modules.moduleInstalled", { name: result.name }));
      await loadCatalog();
    } catch (err) {
      toast.error(
        `${t("admin.modules.install")} ${t("common.error").toLowerCase()}: ${err instanceof Error ? err.message : t("common.error")}`,
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleUninstall = async (moduleId: string) => {
    setActionLoading(moduleId);
    try {
      await uninstallModuleAction(moduleId);
      setModules((prev) => prev.filter((m) => m.moduleId !== moduleId));
      setConfirmUninstall(null);
      toast.success(t("admin.modules.moduleUninstalled"));
      await loadCatalog();
    } catch (err) {
      toast.error(
        `${t("admin.modules.uninstall")} ${t("common.error").toLowerCase()}: ${err instanceof Error ? err.message : t("common.error")}`,
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleStart = async (moduleId: string) => {
    setActionLoading(moduleId);
    try {
      const result = await startModuleAction(moduleId);
      setModules((prev) =>
        prev.map((m) => (m.moduleId === moduleId ? result : m)),
      );
      toast.success(t("admin.modules.moduleStarted"));
    } catch (err) {
      toast.error(
        `${t("admin.modules.start")} ${t("common.error").toLowerCase()}: ${err instanceof Error ? err.message : t("common.error")}`,
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleStop = async (moduleId: string) => {
    setActionLoading(moduleId);
    try {
      const result = await stopModuleAction(moduleId);
      setModules((prev) =>
        prev.map((m) => (m.moduleId === moduleId ? result : m)),
      );
      toast.success(t("admin.modules.moduleStopped"));
    } catch (err) {
      toast.error(
        `${t("admin.modules.stop")} ${t("common.error").toLowerCase()}: ${err instanceof Error ? err.message : t("common.error")}`,
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdate = async (moduleId: string, version: string) => {
    setActionLoading(moduleId);
    try {
      const result = await updateModuleAction({ moduleId, version });
      setModules((prev) =>
        prev.map((m) => (m.moduleId === moduleId ? result : m)),
      );
      toast.success(t("admin.modules.moduleUpdated", { version }));
      await loadCatalog();
    } catch (err) {
      toast.error(
        `${t("admin.modules.update")} ${t("common.error").toLowerCase()}: ${err instanceof Error ? err.message : t("common.error")}`,
      );
    } finally {
      setActionLoading(null);
    }
  };

  // Split catalog into installed and available
  const installedIds = new Set(modules.map((m) => m.moduleId));
  const availableModules = catalog.filter(
    (c) => !installedIds.has(c.registry.id),
  );
  const updatableModules = catalog.filter(
    (c) => c.updateAvailable !== null && installedIds.has(c.registry.id),
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {t("admin.modules.title")}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t("admin.modules.subtitle")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadCatalog}
          disabled={catalogLoading}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${catalogLoading ? "animate-spin" : ""}`}
          />
          {t("admin.modules.refresh")}
        </Button>
      </div>

      {/* Installed modules */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {t("admin.modules.installedCount", { count: modules.length })}
        </h2>
        {modules.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {t("admin.modules.noModulesDesc")}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((mod) => {
              const update = updatableModules.find(
                (c) => c.registry.id === mod.moduleId,
              );
              return (
                <Card key={mod.moduleId}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-zinc-500" />
                        <CardTitle className="text-base">
                          {mod.name}
                        </CardTitle>
                      </div>
                      <StatusBadge variant={statusVariant(mod.status)}>
                        {mod.status}
                      </StatusBadge>
                    </div>
                    <CardDescription>
                      v{mod.version} · {mod.type}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {mod.errorMessage && (
                      <p className="mb-3 text-xs text-red-600 dark:text-red-400">
                        {mod.errorMessage}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {mod.status === "stopped" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStart(mod.moduleId)}
                          disabled={actionLoading === mod.moduleId}
                        >
                          {actionLoading === mod.moduleId ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="mr-1 h-3 w-3" />
                          )}
                          {t("admin.modules.start")}
                        </Button>
                      )}
                      {mod.status === "running" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStop(mod.moduleId)}
                            disabled={actionLoading === mod.moduleId}
                          >
                            <Square className="mr-1 h-3 w-3" />
                            {t("admin.modules.stop")}
                          </Button>
                          {mod.exposure === "public" && (
                            <Button size="sm" variant="outline" asChild>
                              <a
                                href={`/api/modules/${mod.moduleId}/launch`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="mr-1 h-3 w-3" />
                                {t("admin.modules.open")}
                              </a>
                            </Button>
                          )}
                        </>
                      )}
                      {update?.updateAvailable && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() =>
                            handleUpdate(
                              mod.moduleId,
                              update.updateAvailable!,
                            )
                          }
                          disabled={actionLoading === mod.moduleId}
                        >
                          <ArrowUpCircle className="mr-1 h-3 w-3" />
                          v{update.updateAvailable}
                        </Button>
                      )}
                      <Link href={`/admin/modules/${mod.moduleId}`}>
                        <Button size="sm" variant="ghost">
                          {t("admin.modules.details")}
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 dark:text-red-400"
                        onClick={() => setConfirmUninstall(mod)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Available modules from registry */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {t("admin.modules.availableCount", { count: availableModules.length })}
        </h2>
        {catalogLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8 text-sm text-zinc-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("admin.modules.loadingCatalog")}
            </CardContent>
          </Card>
        ) : availableModules.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {catalog.length === 0
                ? t("admin.modules.registryUnavailable")
                : t("admin.modules.allInstalled")}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {availableModules.map((entry) => {
              const latest = entry.registry.versions[0];
              return (
                <Card key={entry.registry.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-zinc-400" />
                      <CardTitle className="text-base">
                        {entry.registry.name}
                      </CardTitle>
                    </div>
                    <CardDescription>
                      {entry.registry.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-3 flex flex-wrap gap-1">
                      {entry.registry.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">
                        v{latest?.version} · {entry.registry.type} ·{" "}
                        {entry.registry.author}
                      </span>
                      <Button
                        size="sm"
                        onClick={() =>
                          latest &&
                          handleInstall(
                            entry.registry.id,
                            latest.version,
                          )
                        }
                        disabled={
                          !latest || actionLoading === entry.registry.id
                        }
                      >
                        {actionLoading === entry.registry.id ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Download className="mr-1 h-3 w-3" />
                        )}
                        {t("admin.modules.install")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Uninstall confirmation dialog */}
      <Dialog
        open={!!confirmUninstall}
        onOpenChange={() => setConfirmUninstall(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.modules.confirmUninstall")}</DialogTitle>
            <DialogDescription>
              {t("admin.modules.confirmUninstallDesc", { name: confirmUninstall?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmUninstall(null)}
            >
              {t("admin.modules.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                confirmUninstall &&
                handleUninstall(confirmUninstall.moduleId)
              }
              disabled={
                !!actionLoading &&
                actionLoading === confirmUninstall?.moduleId
              }
            >
              {actionLoading === confirmUninstall?.moduleId ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-4 w-4" />
              )}
              {t("admin.modules.uninstall")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
