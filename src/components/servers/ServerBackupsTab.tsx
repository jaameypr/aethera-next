"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, RotateCcw, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Backup {
  _id: string;
  name: string;
  filename: string;
  size: number;
  components: string[];
  createdAt: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ServerBackupsTab({ serverId }: { serverId: string }) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    fetchBackups();
  }, [serverId]);

  async function fetchBackups() {
    try {
      const res = await fetch(`/api/servers/${serverId}/backups`);
      if (!res.ok) throw new Error();
      setBackups(await res.json());
    } catch {
      toast.error("Backups konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }

  function handleCreate() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/servers/${serverId}/backups`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            components: ["world", "config", "mods", "plugins", "datapacks"],
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        toast.success("Backup erstellt");
        fetchBackups();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler beim Erstellen");
      }
    });
  }

  function handleRestore(backupId: string) {
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/servers/${serverId}/backups/${backupId}`,
          { method: "POST" },
        );
        if (!res.ok) throw new Error((await res.json()).error);
        toast.success("Backup wiederhergestellt");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Fehler beim Wiederherstellen",
        );
      }
    });
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{backups.length} Backups</p>
        <Button onClick={handleCreate} disabled={isPending} size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {isPending ? "Erstelle…" : "Backup erstellen"}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Lade Backups…</p>
      ) : backups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <HardDrive className="mx-auto mb-2 h-8 w-8 text-zinc-400" />
            <p className="text-sm text-zinc-500">Keine Backups vorhanden</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {backups.map((backup) => (
            <Card key={backup._id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
                <div className="min-w-0">
                  <CardTitle className="truncate text-sm">
                    {backup.filename}
                  </CardTitle>
                  <p className="text-xs text-zinc-500">
                    {formatSize(backup.size)} ·{" "}
                    {new Date(backup.createdAt).toLocaleString()} ·{" "}
                    {backup.components.join(", ")}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    onClick={() => handleRestore(backup._id)}
                    title="Wiederherstellen"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    onClick={() => handleDelete(backup._id)}
                    title="Löschen"
                  >
                    <Trash2 className="h-4 w-4 text-zinc-400 hover:text-red-500" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
