"use client";

import { useState, useEffect, useTransition, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  RotateCcw,
  HardDrive,
  Share2,
  ExternalLink,
  Copy,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  switch (status) {
    case "pending":
      return (
        <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-300">
          <Clock className="h-3 w-3" /> Wartend
        </Badge>
      );
    case "in_progress":
      return (
        <Badge variant="outline" className="gap-1 text-blue-600 border-blue-300">
          <Loader2 className="h-3 w-3 animate-spin" /> Läuft…
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="outline" className="gap-1 text-red-600 border-red-300">
          <XCircle className="h-3 w-3" /> Fehlgeschlagen
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-1 text-green-600 border-green-300">
          <CheckCircle2 className="h-3 w-3" /> Fertig
        </Badge>
      );
  }
}

export function ServerBackupsTab({ serverId }: { serverId: string }) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [capabilities, setCapabilities] = useState<BackupCapabilities | null>(null);
  const [isPending, startTransition] = useTransition();
  const [sharingId, setSharingId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBackups = useCallback(async () => {
    try {
      const res = await fetch(`/api/servers/${serverId}/backups`);
      if (!res.ok) throw new Error();
      setBackups(await res.json());
    } catch {
      toast.error("Backups konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [serverId]);

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
        const data = await res.json();
        if (data.strategy === "async") {
          toast.success("Backup gestartet (async)");
        } else {
          toast.success("Backup erstellt");
        }
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

  async function handleShare(backupId: string) {
    setSharingId(backupId);
    try {
      const res = await fetch(`/api/backups/${backupId}/share`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      toast.success("Share-Link erstellt");
      fetchBackups();
      if (data.shareUrl) {
        await navigator.clipboard.writeText(data.shareUrl);
        toast.info("Link in Zwischenablage kopiert");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Teilen");
    } finally {
      setSharingId(null);
    }
  }

  function copyShareUrl(url: string) {
    navigator.clipboard.writeText(url);
    toast.info("Link kopiert");
  }

  const isCompleted = (b: Backup) => !b.status || b.status === "completed";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm text-zinc-500">{backups.length} Backups</p>
          {capabilities?.async && (
            <Badge variant="secondary" className="text-xs">Async</Badge>
          )}
          {capabilities?.sharing && (
            <Badge variant="secondary" className="text-xs">Sharing</Badge>
          )}
        </div>
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
                    {backup.strategy === "async" && " · async"}
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
                      title="Teilen (Paperview)"
                    >
                      {sharingId === backup._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Share2 className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  {isCompleted(backup) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isPending}
                      onClick={() => handleRestore(backup._id)}
                      title="Wiederherstellen"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
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
