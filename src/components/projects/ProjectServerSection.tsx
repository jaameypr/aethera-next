"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus, ChevronDown, Zap, Trash2, MemoryStick,
  Layers, Pencil, Server as ServerIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
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
  maxCpus?: number;
  maxBackupStorageGb?: number;
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

/** Map a raw server status to a StatusBadge variant (live dot for running). */
const statusVariant = (status: string): "running" | "stopped" | "default" =>
  status === "running" ? "running" : status === "error" ? "stopped" : "default";

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
  const [editMaxCpus, setEditMaxCpus] = useState("");
  const [editMaxBackupStorageGb, setEditMaxBackupStorageGb] = useState("");
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
    setEditMaxCpus(bp.maxCpus != null ? String(bp.maxCpus) : "");
    setEditMaxBackupStorageGb(bp.maxBackupStorageGb != null ? String(bp.maxBackupStorageGb) : "");
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
          maxCpus: editMaxCpus ? Number(editMaxCpus) : undefined,
          maxBackupStorageGb: editMaxBackupStorageGb ? Number(editMaxBackupStorageGb) : undefined,
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
        <EmptyState
          icon={<ServerIcon className="h-6 w-6" />}
          title={t("projects.servers.noServersProject")}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Server cards */}
          {servers.map((server) => (
            <Link
              key={server._id}
              href={`/projects/${projectKey}/servers/${server._id}`}
              className="group"
            >
              <Card interactive className="h-full cursor-pointer">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="truncate text-base transition-colors group-hover:text-brand">
                      {server.name}
                    </CardTitle>
                    <StatusBadge
                      variant={statusVariant(server.status)}
                      className="shrink-0"
                    >
                      {server.status}
                    </StatusBadge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 text-sm text-muted-foreground">
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
              className={`border-dashed transition-opacity ${bp.status === "claimed" ? "opacity-50" : ""}`}
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <CardTitle className="text-base truncate">{bp.name}</CardTitle>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      bp.status === "available"
                        ? "bg-brand-muted text-brand"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {bp.status === "available" ? t("projects.servers.blueprintAvailable") : t("projects.servers.blueprintClaimed")}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground space-y-1 mb-3">
                  <p className="flex items-center gap-1">
                    <MemoryStick className="h-3.5 w-3.5" />
                    {t("projects.blueprints.maxRam")} {ramLabel(bp.maxRam)}
                  </p>
                  <p className="text-xs text-muted-foreground/70">{t("projects.servers.blueprintNotInit")}</p>
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
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-info hover:bg-info-muted"
                      onClick={() => openEdit(bp)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {isAdmin && bp.status === "available" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive-muted"
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
          maxCpus={initTarget.maxCpus}
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
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>512 MB</span>
                <span>32 GB</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-bp-cpus">{t("projects.servers.maxCpusLabel")}</Label>
              <Input
                id="edit-bp-cpus"
                type="number"
                value={editMaxCpus}
                onChange={(e) => setEditMaxCpus(e.target.value)}
                placeholder={t("projects.servers.noCpuLimit")}
                min={1}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-bp-storage">{t("projects.servers.maxBackupStorageLabel")}</Label>
              <Input
                id="edit-bp-storage"
                type="number"
                value={editMaxBackupStorageGb}
                onChange={(e) => setEditMaxBackupStorageGb(e.target.value)}
                placeholder={t("projects.servers.noStorageLimit")}
                min={1}
              />
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
