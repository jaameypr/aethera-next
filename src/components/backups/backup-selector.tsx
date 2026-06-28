"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ExternalLink,
  FileArchive,
  Globe,
  FileText,
  Package,
  Puzzle,
  Database,
  HardDrive,
  X,
  CheckCircle2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocale } from "@/context/locale-context";

type ComponentId = "world" | "config" | "mods" | "plugins" | "datapacks";

interface Backup {
  _id: string;
  name: string;
  filename: string;
  size: number;
  components: string[];
  status: string;
  createdAt: string;
}

export interface BackupSelection {
  backupId: string;
  backupName: string;
  components: ComponentId[];
  availableComponents: ComponentId[];
}

interface BackupSelectorProps {
  selection: BackupSelection | null;
  onSelectionChange: (selection: BackupSelection | null) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function BackupSelector({
  selection,
  onSelectionChange,
}: BackupSelectorProps) {
  const [mode, setMode] = useState<"none" | "existing">("none");
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [search, setSearch] = useState("");
  const { t } = useLocale();

  const COMPONENT_META = useMemo(() => [
    { id: "world" as const, label: t("backupsShared.componentWorlds"), icon: Globe },
    { id: "config" as const, label: t("backupsShared.componentConfig"), icon: FileText },
    { id: "mods" as const, label: t("backupsShared.componentMods"), icon: Package },
    { id: "plugins" as const, label: t("backupsShared.componentPlugins"), icon: Puzzle },
    { id: "datapacks" as const, label: t("backupsShared.componentDatapacks"), icon: Database },
  ], [t]);

  useEffect(() => {
    if (mode === "existing" && backups.length === 0) {
      setLoadingBackups(true);
      fetch("/api/backups/list")
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setBackups(Array.isArray(data) ? data : []))
        .catch(() => {})
        .finally(() => setLoadingBackups(false));
    }
  }, [mode, backups.length]);

  function selectBackup(backup: Backup) {
    const components = backup.components as ComponentId[];
    onSelectionChange({
      backupId: backup._id,
      backupName: backup.filename,
      components: [...components],
      availableComponents: [...components],
    });
  }

  function toggleComponent(id: ComponentId) {
    if (!selection) return;
    const newComponents = selection.components.includes(id)
      ? selection.components.filter((c) => c !== id)
      : [...selection.components, id];
    onSelectionChange({ ...selection, components: newComponents });
  }

  if (selection) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{t("backupsShared.selector.backupToLoad")}</Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onSelectionChange(null);
              setMode("none");
            }}
          >
            <X className="mr-1 h-3 w-3" />
            {t("backupsShared.selector.remove")}
          </Button>
        </div>

        <div className="rounded-lg border border-brand/30 bg-brand-muted/30 p-3">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-brand" />
            <span className="text-sm font-medium truncate">
              {selection.backupName}
            </span>
          </div>

          <p className="text-xs text-muted-foreground mb-2">
            {t("backupsShared.selector.selectComponents")}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {COMPONENT_META.map((comp) => {
              const Icon = comp.icon;
              const available = selection.availableComponents.includes(comp.id);
              const checked = selection.components.includes(comp.id);
              return (
                <div
                  key={comp.id}
                  className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-[border-color,background-color,color] duration-150 ${
                    !available
                      ? "border-border opacity-40"
                      : checked
                        ? "border-brand bg-brand text-brand-foreground cursor-pointer"
                        : "border-border cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-600"
                  }`}
                  onClick={() => available && toggleComponent(comp.id)}
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  <span className="font-medium">{comp.label}</span>
                  {available && (
                    <Checkbox
                      checked={checked}
                      className="ml-auto h-3.5 w-3.5"
                      onCheckedChange={() => toggleComponent(comp.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (mode === "none") {
    return (
      <div className="space-y-3">
        <Label className="text-sm font-medium">
          {t("backupsShared.selector.loadFromBackup")}
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("existing")}
            className="group flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-center transition-[border-color,background-color] duration-150 hover:border-brand/50 hover:bg-brand-muted/30"
          >
            <HardDrive className="h-6 w-6 text-muted-foreground transition-colors group-hover:text-brand" />
            <span className="text-xs font-medium">{t("backupsShared.selector.existingBackup")}</span>
          </button>
          <a
            href="/verzeichnis/backups"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-center transition-[border-color,background-color] duration-150 hover:border-brand/50 hover:bg-brand-muted/30"
          >
            <ExternalLink className="h-6 w-6 text-muted-foreground transition-colors group-hover:text-brand" />
            <span className="text-xs font-medium">{t("backupsShared.selector.importBackup")}</span>
          </a>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("backupsShared.selector.importHint")}
        </p>
      </div>
    );
  }

  const filtered = backups.filter(
    (b) =>
      b.status === "completed" &&
      (search === "" ||
        b.filename.toLowerCase().includes(search.toLowerCase()) ||
        b.name.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{t("backupsShared.selector.selectBackup")}</Label>
        <Button variant="ghost" size="sm" onClick={() => setMode("none")}>
          {t("common.back")}
        </Button>
      </div>

      {backups.length > 3 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={t("backupsShared.selector.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
      )}

      <div className="max-h-[200px] overflow-y-auto space-y-1 rounded-lg border border-border p-1">
        {loadingBackups ? (
          <div className="space-y-1 p-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2"
              >
                <Skeleton className="h-4 w-4 shrink-0 rounded" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-6">
            <HardDrive className="mx-auto h-6 w-6 text-muted-foreground/50 mb-1" />
            <p className="text-xs text-muted-foreground">
              {backups.length === 0 ? t("backupsShared.selector.noBackupsFound") : t("backupsShared.selector.noResults")}
            </p>
          </div>
        ) : (
          filtered.map((backup) => (
            <button
              key={backup._id}
              type="button"
              onClick={() => selectBackup(backup)}
              className="group flex items-center gap-2.5 w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-brand-muted/40"
            >
              <FileArchive className="h-4 w-4 text-muted-foreground shrink-0 transition-colors group-hover:text-brand" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{backup.filename}</p>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span>{formatSize(backup.size)}</span>
                  <span>·</span>
                  <span>{new Date(backup.createdAt).toLocaleDateString()}</span>
                  <span>·</span>
                  <span>{backup.components.join(", ")}</span>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
