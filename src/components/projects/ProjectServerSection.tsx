"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus, Play, Square, ChevronDown, Zap, Trash2, MemoryStick,
  Layers, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { deleteBlueprintAction, updateBlueprintAction } from "@/app/(app)/actions/servers";
import { useLocale } from "@/context/locale-context";

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
  canInitialize: boolean;
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
  canInitialize,
}: ProjectServerSectionProps) {
  const [createBlueprintOpen, setCreateBlueprintOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Blueprint | null>(null);
  const [initTarget, setInitTarget] = useState<Blueprint | null>(null);
  const [editTarget, setEditTarget] = useState<Blueprint | null>(null);
  const [editName, setEditName] = useState("");
  const [editMaxRam, setEditMaxRam] = useState(2048);
  const [isDeleting, startDelete] = useTransition();
  const [isEditing, startEdit] = useTransition();
  const { t } = useLocale();

  function handleDelete() {
    if (!deleteTarget) return;
    startDelete(async () => {
      try {
        await deleteBlueprintAction({ blueprintId: deleteTarget._id, projectKey });
        toast.success(t("projects.servers.blueprintDeleted"));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("common.error"));
      } finally {
        setDeleteTarget(null);
      }
    });
  }

  function openEdit(bp: Blueprint) {
    setEditTarget(bp);
    setEditName(bp.name);
    setEditMaxRam(bp.maxRam);
  }

  function handleEdit() {
    if (!editTarget) return;
    startEdit(async () => {
      try {
        await updateBlueprintAction({
          blueprintId: editTarget._id,
          projectKey,
          name: editName,
          maxRam: editMaxRam,
        });
        toast.success(t("projects.servers.blueprintUpdated"));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("common.error"));
      } finally {
        setEditTarget(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("projects.servers.title")}</h2>
        {isAdmin && (
          <div className="flex items-center">
            <Button asChild className="rounded-r-none">
              <Link href={`/projects/${projectKey}/servers/new`}>
                <Plus className="mr-2 h-4 w-4" />
                {t("projects.servers.createServer")}
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="default"
                  className="rounded-l-none border-l border-primary-foreground/20 px-2"
                  aria-label={t("projects.servers.moreOptions")}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setCreateBlueprintOpen(true)}>
                  <Layers className="mr-2 h-4 w-4" />
                  {t("projects.servers.createBlueprint")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Unified server + blueprint grid */}
      {servers.length === 0 && blueprints.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-zinc-500">
            {t("projects.servers.noServersProject")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Server cards */}
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

          {/* Blueprint cards */}
          {blueprints.map((bp) => (
            <Card
              key={bp._id}
              className={`transition-opacity ${bp.status === "claimed" ? "opacity-50" : ""}`}
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Layers className="h-4 w-4 shrink-0 text-zinc-400" />
                    <CardTitle className="text-base truncate">{bp.name}</CardTitle>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      bp.status === "available"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {bp.status === "available" ? t("projects.servers.blueprintAvailable") : t("projects.servers.blueprintClaimed")}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-zinc-500 space-y-1 mb-3">
                  <p className="flex items-center gap-1">
                    <MemoryStick className="h-3.5 w-3.5" />
                    {t("projects.blueprints.maxRam")} {ramLabel(bp.maxRam)}
                  </p>
                  <p className="text-xs text-zinc-400">{t("projects.servers.blueprintNotInit")}</p>
                </div>
                <div className="flex items-center gap-2">
                  {canInitialize && bp.status === "available" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 text-xs"
                      onClick={() => setInitTarget(bp)}
                    >
                      <Zap className="mr-1.5 h-3 w-3" />
                      {t("projects.servers.initialize")}
                    </Button>
                  )}
                  {isAdmin && bp.status === "available" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                      onClick={() => openEdit(bp)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {isAdmin && bp.status === "available" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                      onClick={() => setDeleteTarget(bp)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
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
            <DialogTitle>{t("projects.servers.confirmDeleteBlueprintTitle")}</DialogTitle>
            <DialogDescription>
              {t("projects.servers.confirmDeleteBlueprintDesc", { name: deleteTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              {t("projects.servers.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? t("projects.servers.deleting") : t("projects.servers.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("projects.servers.editBlueprintTitle")}</DialogTitle>
            <DialogDescription>
              {t("projects.servers.editBlueprintDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-bp-name">{t("projects.servers.addServer")}</Label>
              <Input
                id="edit-bp-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t("projects.servers.maxRamLabel")}</Label>
                <span className="text-sm font-semibold">{ramLabel(editMaxRam)}</span>
              </div>
              <Slider
                value={[editMaxRam]}
                onValueChange={([v]) => setEditMaxRam(v)}
                min={512}
                max={32768}
                step={256}
              />
              <div className="flex justify-between text-xs text-zinc-500">
                <span>512 MB</span>
                <span>32 GB</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={isEditing}>
              {t("projects.servers.cancel")}
            </Button>
            <Button onClick={handleEdit} disabled={isEditing || !editName.trim()}>
              {isEditing ? t("projects.servers.saving") : t("projects.servers.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
