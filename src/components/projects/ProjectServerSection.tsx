"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus, Play, Square, ChevronDown, Zap, Trash2, MemoryStick,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { CreateBlueprintDialog } from "@/components/projects/CreateBlueprintDialog";
import { CreateServerWizard } from "@/components/servers/create-server-wizard";
import { deleteBlueprintAction } from "@/app/(app)/actions/servers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Server {
  _id: string;
  name: string;
  status: string;
  runtime: string;
  version?: string;
  port: number;
  memory: number;
}

interface Blueprint {
  _id: string;
  name: string;
  maxRam: number;
  status: "available" | "claimed";
  serverId?: string;
}

interface ProjectServerSectionProps {
  projectKey: string;
  servers: Server[];
  blueprints: Blueprint[];
  isAdmin: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ramLabel = (mb: number) =>
  mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProjectServerSection({
  projectKey,
  servers,
  blueprints,
  isAdmin,
}: ProjectServerSectionProps) {
  const [createBlueprintOpen, setCreateBlueprintOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Blueprint | null>(null);
  const [initTarget, setInitTarget] = useState<Blueprint | null>(null);
  const [isDeleting, startDelete] = useTransition();

  function handleDelete() {
    if (!deleteTarget) return;
    startDelete(async () => {
      try {
        await deleteBlueprintAction({ blueprintId: deleteTarget._id, projectKey });
        toast.success("Blueprint gelöscht");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler beim Löschen");
      } finally {
        setDeleteTarget(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Server</h2>
        {isAdmin && (
          <div className="flex items-center">
            <Button asChild className="rounded-r-none">
              <Link href={`/projects/${projectKey}/servers/new`}>
                <Plus className="mr-2 h-4 w-4" />
                Server erstellen
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="default"
                  className="rounded-l-none border-l border-primary-foreground/20 px-2"
                  aria-label="Weitere Optionen"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setCreateBlueprintOpen(true)}>
                  <Layers className="mr-2 h-4 w-4" />
                  Blueprint erstellen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Server cards */}
      {servers.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-zinc-500">
            Noch keine Server in diesem Projekt.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {servers.map((server) => (
            <Link
              key={server._id}
              href={`/projects/${projectKey}/servers/${server._id}`}
            >
              <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base truncate">{server.name}</CardTitle>
                    <span
                      className={`shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                        server.status === "running"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {server.status === "running" ? (
                        <Play className="h-3 w-3" />
                      ) : (
                        <Square className="h-3 w-3" />
                      )}
                      {server.status}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-zinc-500 space-y-1">
                    <p>{server.runtime} · {server.version ?? "latest"}</p>
                    <p>Port {server.port} · {server.memory} MB RAM</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Blueprints subsection */}
      {(blueprints.length > 0 || isAdmin) && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-zinc-400" />
            <h3 className="text-sm font-medium text-zinc-500 uppercase tracking-wide">
              Blueprints
            </h3>
          </div>

          {blueprints.length === 0 ? (
            <p className="text-sm text-zinc-400 pl-6">
              Keine Blueprints vorhanden. Erstelle einen über den Button oben.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {blueprints.map((bp) => (
                <Card
                  key={bp._id}
                  className={`transition-opacity ${bp.status === "claimed" ? "opacity-50" : ""}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-sm truncate">{bp.name}</CardTitle>
                        <CardDescription className="flex items-center gap-1 mt-0.5 text-xs">
                          <MemoryStick className="h-3 w-3" />
                          Max. {ramLabel(bp.maxRam)}
                        </CardDescription>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                          bp.status === "available"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        {bp.status === "available" ? "Verfügbar" : "Belegt"}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex items-center gap-2">
                    {bp.status === "available" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs"
                        onClick={() => setInitTarget(bp)}
                      >
                        <Zap className="mr-1.5 h-3 w-3" />
                        Initialisieren
                      </Button>
                    )}
                    {isAdmin && bp.status === "available" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                        onClick={() => setDeleteTarget(bp)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <CreateBlueprintDialog
        projectKey={projectKey}
        open={createBlueprintOpen}
        onOpenChange={setCreateBlueprintOpen}
      />

      {initTarget && (
        <CreateServerWizard
          projectKey={projectKey}
          open={!!initTarget}
          onOpenChange={(o) => { if (!o) setInitTarget(null); }}
          blueprintId={initTarget._id}
          maxRam={initTarget.maxRam}
        />
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Blueprint löschen?</DialogTitle>
            <DialogDescription>
              Der Blueprint <strong>{deleteTarget?.name}</strong> wird dauerhaft gelöscht.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Löschen…" : "Löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
