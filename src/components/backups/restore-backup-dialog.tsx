"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Loader2,
  RotateCcw,
  Globe,
  FileText,
  Package,
  Puzzle,
  Database,
  AlertCircle,
  FileArchive,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/context/locale-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type ComponentId = "world" | "config" | "mods" | "plugins" | "datapacks";

interface BackupAnalysis {
  components: Record<string, string[]>;
  totalFiles: number;
  totalSize: number;
}

interface RestoreBackupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  backupId: string;
  backupName: string;
  serverId: string;
  serverName: string;
  /** Pre-known components from the backup record (skip analysis) */
  availableComponents?: string[];
  onRestored?: () => void;
}

export function RestoreBackupDialog({
  open,
  onOpenChange,
  backupId,
  backupName,
  serverId,
  serverName,
  availableComponents,
  onRestored,
}: RestoreBackupDialogProps) {
  const [analysis, setAnalysis] = useState<BackupAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectedComponents, setSelectedComponents] = useState<ComponentId[]>([]);
  const { t } = useLocale();

  const COMPONENT_META = useMemo(() => [
    { id: "world" as const, label: t("backupsShared.componentWorlds"), description: t("servers.backups.componentWorldsDesc"), icon: Globe },
    { id: "config" as const, label: t("backupsShared.componentConfig"), description: t("servers.backups.componentConfigDesc"), icon: FileText },
    { id: "mods" as const, label: t("backupsShared.componentMods"), description: t("servers.backups.componentModsDesc"), icon: Package },
    { id: "plugins" as const, label: t("backupsShared.componentPlugins"), description: t("servers.backups.componentPluginsDesc"), icon: Puzzle },
    { id: "datapacks" as const, label: t("backupsShared.componentDatapacks"), description: t("servers.backups.componentDatapacksDesc"), icon: Database },
  ], [t]);

  // Analyze backup contents when dialog opens
  useEffect(() => {
    if (!open || !backupId) return;

    if (availableComponents && availableComponents.length > 0) {
      setSelectedComponents(availableComponents as ComponentId[]);
      setAnalysis(null);
      setAnalyzing(false);
      return;
    }

    setAnalyzing(true);
    fetch(`/api/backups/${backupId}/analyze`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data: BackupAnalysis) => {
        setAnalysis(data);
        const detected = Object.entries(data.components)
          .filter(([, files]) => files.length > 0)
          .map(([comp]) => comp as ComponentId);
        setSelectedComponents(detected);
      })
      .catch(() => toast.error(t("backupsShared.restore.analysisFailed")))
      .finally(() => setAnalyzing(false));
  }, [open, backupId, availableComponents]);

  function toggleComponent(id: ComponentId) {
    setSelectedComponents((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  const detectedComponents = availableComponents
    ? (availableComponents as ComponentId[])
    : analysis
      ? (Object.entries(analysis.components)
          .filter(([, files]) => files.length > 0)
          .map(([comp]) => comp) as ComponentId[])
      : [];

  function toggleAll() {
    setSelectedComponents((prev) =>
      prev.length === detectedComponents.length ? [] : [...detectedComponents],
    );
  }

  async function handleRestore() {
    if (selectedComponents.length === 0) {
      toast.error(t("backupsShared.restore.selectAtLeastOne"));
      return;
    }
    setRestoring(true);
    try {
      const res = await fetch(
        `/api/backups/${backupId}/restore-to/${serverId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ components: selectedComponents }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t("backupsShared.restore.failed"));
      }
      toast.success(t("backupsShared.restore.success"));
      onOpenChange(false);
      onRestored?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("backupsShared.restore.error"),
      );
    } finally {
      setRestoring(false);
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            {t("backupsShared.restore.title")}
          </DialogTitle>
          <DialogDescription>
            {t("backupsShared.restore.description", { backupName, serverName })}
          </DialogDescription>
        </DialogHeader>

        {analyzing ? (
          <div className="flex items-center justify-center py-8 gap-2 text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{t("backupsShared.restore.analyzing")}</span>
          </div>
        ) : (
          <div className="space-y-1 py-2">
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2 mb-3">
              <Info className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {t("backupsShared.restore.warning")}
              </p>
            </div>

            {detectedComponents.length > 1 && (
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-200 dark:border-zinc-800">
                <Label
                  className="text-sm font-medium cursor-pointer"
                  onClick={toggleAll}
                >
                  {t("backupsShared.restore.selectAll")}
                </Label>
                <Checkbox
                  checked={selectedComponents.length === detectedComponents.length}
                  onCheckedChange={toggleAll}
                />
              </div>
            )}

            {COMPONENT_META.map((comp) => {
              const Icon = comp.icon;
              const isAvailable = detectedComponents.includes(comp.id);
              const checked = selectedComponents.includes(comp.id);
              const fileCount = analysis?.components[comp.id]?.length ?? 0;

              return (
                <div
                  key={comp.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                    !isAvailable
                      ? "border-zinc-100 bg-zinc-50/50 opacity-50 dark:border-zinc-900 dark:bg-zinc-950/50"
                      : checked
                        ? "border-zinc-900 bg-zinc-50 cursor-pointer dark:border-zinc-50 dark:bg-zinc-900"
                        : "border-zinc-200 hover:border-zinc-300 cursor-pointer dark:border-zinc-800 dark:hover:border-zinc-700"
                  }`}
                  onClick={() => isAvailable && toggleComponent(comp.id)}
                >
                  <div
                    className={`rounded-md p-2 ${
                      !isAvailable
                        ? "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"
                        : checked
                          ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{comp.label}</p>
                      {!isAvailable && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {t("backupsShared.restore.notInBackup")}
                        </Badge>
                      )}
                      {isAvailable && fileCount > 0 && (
                        <span className="text-[10px] text-zinc-500">
                          {fileCount === 1
                            ? t("verzeichnis.files.fileCount1", { count: fileCount })
                            : t("verzeichnis.files.filesCount", { count: fileCount })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500">{comp.description}</p>
                  </div>
                  {isAvailable && (
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleComponent(comp.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                </div>
              );
            })}

            {analysis && (
              <p className="text-xs text-zinc-500 pt-2">
                {analysis.totalFiles} Dateien · {formatSize(analysis.totalSize)}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={restoring}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleRestore}
            disabled={restoring || analyzing || selectedComponents.length === 0}
          >
            {restoring ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {t("backupsShared.restore.restoring")}
              </>
            ) : (
              <>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                {selectedComponents.length === detectedComponents.length
                  ? t("backupsShared.restore.restoreAll")
                  : t("backupsShared.restore.restoreCount", { count: selectedComponents.length })}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
