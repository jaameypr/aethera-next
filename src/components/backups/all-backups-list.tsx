"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Share2,
  ExternalLink,
  Copy,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  HardDrive,
  Server,
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
  serverId: string;
  serverName: string;
  name: string;
  filename: string;
  size: number;
  components: string[];
  status: string;
  strategy: string;
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

function StatusBadge({ status }: { status: string }) {
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

export function AllBackupsList({ backups: initial }: { backups: Backup[] }) {
  const [backups, setBackups] = useState(initial);
  const [capabilities, setCapabilities] = useState<BackupCapabilities | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/backups/capabilities")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => c && setCapabilities(c))
      .catch(() => {});
  }, []);

  async function handleShare(backupId: string) {
    setSharingId(backupId);
    try {
      const res = await fetch(`/api/backups/${backupId}/share`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();

      setBackups((prev) =>
        prev.map((b) =>
          b._id === backupId ? { ...b, shareUrl: data.shareUrl } : b,
        ),
      );

      toast.success("Share-Link erstellt");
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {capabilities?.async && (
          <Badge variant="secondary" className="text-xs">Async Backups aktiv</Badge>
        )}
        {capabilities?.sharing && (
          <Badge variant="secondary" className="text-xs">Paperview Sharing aktiv</Badge>
        )}
      </div>

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
                  {backup.strategy === "async" && (
                    <Badge variant="secondary" className="text-xs">async</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-zinc-500 mt-0.5">
                  <Server className="h-3 w-3" />
                  <span>{backup.serverName}</span>
                  <span>·</span>
                  {backup.size > 0 && (
                    <>
                      <span>{formatSize(backup.size)}</span>
                      <span>·</span>
                    </>
                  )}
                  <span>{new Date(backup.createdAt).toLocaleString()}</span>
                  <span>·</span>
                  <span>{backup.components.join(", ")}</span>
                </div>
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
                      className="text-xs text-blue-500 hover:underline truncate max-w-[300px]"
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
                {capabilities?.sharing &&
                  backup.status === "completed" &&
                  !backup.shareUrl && (
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
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
