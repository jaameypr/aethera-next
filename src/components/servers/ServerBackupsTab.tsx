"use client";

import { useState, useEffect, useTransition, useRef, useCallback } from "react";
import { useLocale } from "@/context/locale-context";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  RotateCcw,
  HardDrive,
  Share2,
  RefreshCw,
  ExternalLink,
  Copy,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  Settings2,
  Globe,
  FileText,
  Package,
  Puzzle,
  Database,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ImportBackupDialog } from "@/components/backups/import-backup-dialog";
import { RestoreBackupDialog } from "@/components/backups/restore-backup-dialog";

interface Backup {
  _id: string;
  name: string;
  filename: string;
  size: number;
  components: string[];
  status?: string;
  strategy?: string;
  shareUrl?: string;
  errorMessage?: string;
  createdAt: string;
}

interface BackupCapabilities {
  async: boolean;
  sharing: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status?: string }) {
  const { t } = useLocale();
  switch (status) {
    case "pending":
      return (
        <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-300">
          <Clock className="h-3 w-3" /> {t("servers.backups.statusPending")}
        </Badge>
      );
    case "in_progress":
      return (
        <Badge variant="outline" className="gap-1 text-blue-600 border-blue-300">
          <Loader2 className="h-3 w-3 animate-spin" /> {t("servers.backups.statusInProgress")}
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="outline" className="gap-1 text-red-600 border-red-300">
          <XCircle className="h-3 w-3" /> {t("servers.backups.statusFailed")}
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-1 text-green-600 border-green-300">
          <CheckCircle2 className="h-3 w-3" /> {t("servers.backups.statusCompleted")}
        </Badge>
      );
  }
}

type BackupComponentId = "world" | "config" | "mods" | "plugins" | "datapacks";

const ALL_COMPONENT_IDS: BackupComponentId[] = ["world", "config", "mods", "plugins", "datapacks"];

export function ServerBackupsTab({ serverId, serverName }: { serverId: string; serverName: string }) {
  const { t } = useLocale();

  const BACKUP_COMPONENTS = [
    { id: "world" as BackupComponentId, label: t("servers.backups.componentWorlds"), description: t("servers.backups.componentWorldsDesc"), icon: Globe },
    { id: "config" as BackupComponentId, label: t("servers.backups.componentConfig"), description: t("servers.backups.componentConfigDesc"), icon: FileText },
    { id: "mods" as BackupComponentId, label: t("servers.backups.componentMods"), description: t("servers.backups.componentModsDesc"), icon: Package },
    { id: "plugins" as BackupComponentId, label: t("servers.backups.componentPlugins"), description: t("servers.backups.componentPluginsDesc"), icon: Puzzle },
    { id: "datapacks" as BackupComponentId, label: t("servers.backups.componentDatapacks"), description: t("servers.backups.componentDatapacksDesc"), icon: Database },
  ];

  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [capabilities, setCapabilities] = useState<BackupCapabilities | null>(null);
  const [isPending, startTransition] = useTransition();
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [selectedComponents, setSelectedComponents] = useState<BackupComponentId[]>([...ALL_COMPONENT_IDS]);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBackups = useCallback(async () => {
    try {
      const res = await fetch(`/api/servers/${serverId}/backups`);
      if (!res.ok) throw new Error();
      setBackups(await res.json());
    } catch {
      toast.error(t("servers.backups.loadError"));
    } finally {
      setLoading(false);
    }
  }, [serverId, t]);

  useEffect(() => {
    fetchBackups();
    fetch("/api/backups/capabilities")
      .then((r) => r.ok ? r.json() : null)
      .then((c) => c && setCapabilities(c))
      .catch(() => {});
  }, [fetchBackups]);

  // Poll while any backup is pending/in_progress
  useEffect(() => {
    const hasPending = backups.some(
      (b) => b.status === "pending" || b.status === "in_progress",
    );

    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(fetchBackups, 5000);
    } else if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [backups, fetchBackups]);

  function handleCreate(components: BackupComponentId[] = [...ALL_COMPONENT_IDS]) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/servers/${serverId}/backups`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ components }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        const data = await res.json();
        if (data.strategy === "async") {
          toast.success(t("servers.backups.createdAsync"));
        } else {
          toast.success(t("servers.backups.created"));
        }
        fetchBackups();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("servers.backups.createError"));
      }
    });
  }

  function handleCustomBackup() {
    if (selectedComponents.length === 0) {
      toast.error("Wähle mindestens eine Komponente aus");
      return;
    }
    setCustomDialogOpen(false);
    handleCreate(selectedComponents);
  }

  function toggleComponent(id: BackupComponentId) {
    setSelectedComponents((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  function toggleAll() {
    setSelectedComponents((prev) =>
      prev.length === ALL_COMPONENT_IDS.length ? [] : [...ALL_COMPONENT_IDS],
    );
  }

  function handleRestore(backup: Backup) {
    setRestoreTarget(backup);
  }

  function handleDelete(backupId: string) {
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/servers/${serverId}/backups/${backupId}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error();
        toast.success("Backup gelöscht");
        fetchBackups();
      } catch {
        toast.error("Fehler beim Löschen");
      }
    });
  }

  async function handleShare(backupId: string, force = false) {
    setSharingId(backupId);
    try {
      const url = force
        ? `/api/backups/${backupId}/share?force=true`
        : `/api/backups/${backupId}/share`;
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      toast.success(force ? t("servers.backups.reshared") : t("servers.backups.shareLinkCreated"));
      fetchBackups();
      if (data.shareUrl) {
        await copyToClipboard(data.shareUrl);
        toast.info(t("servers.backups.linkCopied"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("servers.backups.shareError"));
    } finally {
      setSharingId(null);
    }
  }

  function copyShareUrl(url: string) {
    copyToClipboard(url);
    toast.info(t("servers.backups.linkCopied2"));
  }

  const isCompleted = (b: Backup) => !b.status || b.status === "completed";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm text-zinc-500">{t("servers.backups.countLabel", { count: backups.length })}</p>
          {capabilities?.async && (
            <Badge variant="secondary" className="text-xs">{t("servers.backups.asyncBadge")}</Badge>
          )}
          {capabilities?.sharing && (
            <Badge variant="secondary" className="text-xs">{t("servers.backups.sharingBadge")}</Badge>
          )}
        </div>
        <div className="flex items-center">
          <Button
            onClick={() => handleCreate()}
            disabled={isPending}
            size="sm"
            className="rounded-r-none"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {isPending ? "Erstelle…" : "Backup erstellen"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                disabled={isPending}
                className="rounded-l-none border-l border-l-white/20 px-2"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setSelectedComponents([...ALL_COMPONENT_IDS]);
                  setCustomDialogOpen(true);
                }}
              >
                <Settings2 className="mr-2 h-4 w-4" />
                Benutzerdefiniertes Backup
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setImportDialogOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Backup importieren
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">{t("servers.backups.loading")}</p>
      ) : backups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <HardDrive className="mx-auto mb-2 h-8 w-8 text-zinc-400" />
            <p className="text-sm text-zinc-500">{t("servers.backups.noBackups")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {backups.map((backup) => (
            <Card key={backup._id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="truncate text-sm">
                      {backup.filename}
                    </CardTitle>
                    <StatusBadge status={backup.status} />
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {backup.size > 0 && `${formatSize(backup.size)} · `}
                    {new Date(backup.createdAt).toLocaleString()} ·{" "}
                    {backup.components.join(", ")}
                    {backup.strategy === "async" && ` · ${t("servers.backups.asyncLabel")}`}
                  </p>
                  {backup.errorMessage && (
                    <p className="text-xs text-red-500 mt-0.5">{backup.errorMessage}</p>
                  )}
                  {backup.shareUrl && (
                    <div className="flex items-center gap-1 mt-1">
                      <ExternalLink className="h-3 w-3 text-zinc-400" />
                      <a
                        href={backup.shareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:underline truncate max-w-[200px]"
                      >
                        {backup.shareUrl}
                      </a>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => copyShareUrl(backup.shareUrl!)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex gap-1 ml-2">
                  {capabilities?.sharing && isCompleted(backup) && !backup.shareUrl && (
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={sharingId === backup._id}
                      onClick={() => handleShare(backup._id)}
                      title={t("servers.backups.shareTooltip")}
                    >
                      {sharingId === backup._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Share2 className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  {capabilities?.sharing && isCompleted(backup) && backup.shareUrl && (
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={sharingId === backup._id}
                      onClick={() => handleShare(backup._id, true)}
                      title={t("servers.backups.reshareTooltip")}
                    >
                      {sharingId === backup._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  {isCompleted(backup) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isPending}
                      onClick={() => handleRestore(backup)}
                      title={t("servers.backups.restoreTooltip")}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    onClick={() => handleDelete(backup._id)}
                    title={t("servers.backups.deleteTooltip")}
                  >
                    <Trash2 className="h-4 w-4 text-zinc-400 hover:text-red-500" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Custom Backup Dialog */}
      <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Benutzerdefiniertes Backup</DialogTitle>
            <DialogDescription>
              Wähle aus, welche Komponenten gesichert werden sollen.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1 py-2">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-200 dark:border-zinc-800">
              <Label className="text-sm font-medium cursor-pointer" onClick={toggleAll}>
                Alle auswählen
              </Label>
              <Checkbox
                checked={selectedComponents.length === ALL_COMPONENT_IDS.length}
                onCheckedChange={toggleAll}
              />
            </div>

            {BACKUP_COMPONENTS.map((comp) => {
              const Icon = comp.icon;
              const checked = selectedComponents.includes(comp.id);
              return (
                <div
                  key={comp.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    checked
                      ? "border-zinc-900 bg-zinc-50 dark:border-zinc-50 dark:bg-zinc-900"
                      : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
                  }`}
                  onClick={() => toggleComponent(comp.id)}
                >
                  <div className={`rounded-md p-2 ${
                    checked
                      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{comp.label}</p>
                    <p className="text-xs text-zinc-500">{comp.description}</p>
                  </div>
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleComponent(comp.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={handleCustomBackup}
              disabled={selectedComponents.length === 0 || isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Erstelle…
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {selectedComponents.length === ALL_COMPONENT_IDS.length
                    ? "Vollständiges Backup"
                    : `${selectedComponents.length} ${selectedComponents.length === 1 ? "Komponente" : "Komponenten"} sichern`}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Backup Dialog */}
      <ImportBackupDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImported={() => fetchBackups()}
      />

      {/* Restore Backup Dialog */}
      {restoreTarget && (
        <RestoreBackupDialog
          open={!!restoreTarget}
          onOpenChange={(open) => !open && setRestoreTarget(null)}
          backupId={restoreTarget._id}
          backupName={restoreTarget.filename}
          serverId={serverId}
          serverName={serverName}
          availableComponents={restoreTarget.components}
          onRestored={() => fetchBackups()}
        />
      )}
    </div>
  );
}
