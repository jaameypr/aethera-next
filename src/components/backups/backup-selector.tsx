"use client";

import { useState, useEffect } from "react";
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

const COMPONENT_META = [
  { id: "world" as const, label: "Welten", icon: Globe },
  { id: "config" as const, label: "Konfiguration", icon: FileText },
  { id: "mods" as const, label: "Mods", icon: Package },
  { id: "plugins" as const, label: "Plugins", icon: Puzzle },
  { id: "datapacks" as const, label: "Datapacks", icon: Database },
] as const;

type ComponentId = (typeof COMPONENT_META)[number]["id"];

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
          <Label className="text-sm font-medium">Backup zum Laden</Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onSelectionChange(null);
              setMode("none");
            }}
          >
            <X className="mr-1 h-3 w-3" />
            Entfernen
          </Button>
        </div>

        <div className="rounded-lg border border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20 p-3">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium truncate">
              {selection.backupName}
            </span>
          </div>

          <p className="text-xs text-zinc-500 mb-2">
            Komponenten zum Laden auswählen:
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {COMPONENT_META.map((comp) => {
              const Icon = comp.icon;
              const available = selection.availableComponents.includes(comp.id);
              const checked = selection.components.includes(comp.id);
              return (
                <div
                  key={comp.id}
                  className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                    !available
                      ? "border-zinc-100 opacity-40 dark:border-zinc-900"
                      : checked
                        ? "border-zinc-900 bg-zinc-900 text-white cursor-pointer dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                        : "border-zinc-200 cursor-pointer hover:border-zinc-300 dark:border-zinc-700"
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
          Von Backup laden (optional)
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("existing")}
            className="flex flex-col items-center gap-2 rounded-lg border border-zinc-200 p-4 text-center transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
          >
            <HardDrive className="h-6 w-6 text-zinc-400" />
            <span className="text-xs font-medium">Bestehendes Backup</span>
          </button>
          <a
            href="/verzeichnis/backups"
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-2 rounded-lg border border-zinc-200 p-4 text-center transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
          >
            <ExternalLink className="h-6 w-6 text-zinc-400" />
            <span className="text-xs font-medium">Backup importieren</span>
          </a>
        </div>
        <p className="text-xs text-zinc-500">
          Backup zuerst auf der Backup-Seite importieren, dann hier auswählen.
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
        <Label className="text-sm font-medium">Backup auswählen</Label>
        <Button variant="ghost" size="sm" onClick={() => setMode("none")}>
          Zurück
        </Button>
      </div>

      {backups.length > 3 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
          <Input
            placeholder="Backup suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
      )}

      <div className="max-h-[200px] overflow-y-auto space-y-1 rounded-lg border border-zinc-200 dark:border-zinc-800 p-1">
        {loadingBackups ? (
          <div className="flex items-center justify-center py-6 text-zinc-500">
            <HardDrive className="h-4 w-4 mr-2 animate-pulse" />
            <span className="text-xs">Lade Backups...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-6">
            <HardDrive className="mx-auto h-6 w-6 text-zinc-300 mb-1" />
            <p className="text-xs text-zinc-500">
              {backups.length === 0 ? "Keine Backups vorhanden" : "Keine Ergebnisse"}
            </p>
          </div>
        ) : (
          filtered.map((backup) => (
            <button
              key={backup._id}
              type="button"
              onClick={() => selectBackup(backup)}
              className="flex items-center gap-2.5 w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <FileArchive className="h-4 w-4 text-zinc-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{backup.filename}</p>
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
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
