"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Zap, MemoryStick } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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

interface Blueprint {
  _id: string;
  name: string;
  maxRam: number;
  status: "available" | "claimed";
  serverId?: string;
}

interface BlueprintsListProps {
  projectKey: string;
  blueprints: Blueprint[];
  isAdmin: boolean;
  canInitialize: boolean;
}

export function BlueprintsList({
  projectKey,
  blueprints,
  isAdmin,
  canInitialize,
}: BlueprintsListProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Blueprint | null>(null);
  const [initTarget, setInitTarget] = useState<Blueprint | null>(null);
  const [isDeleting, startDelete] = useTransition();
  const { t } = useLocale();

  function handleDelete() {
    if (!deleteTarget) return;
    startDelete(async () => {
      try {
        await deleteBlueprintAction({
          blueprintId: deleteTarget._id,
          projectKey,
        });
        toast.success(t("projects.servers.blueprintDeleted"));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("common.error"));
      } finally {
        setDeleteTarget(null);
      }
    });
  }

  const ramLabel = (mb: number) =>
    mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("projects.servers.blueprints")}</h2>
        {isAdmin && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t("projects.servers.createBlueprint")}
          </Button>
        )}
      </div>

      {blueprints.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-zinc-500">
            {isAdmin
              ? "Noch keine Blueprints. Erstelle einen, um Servern RAM-Limits zuzuweisen."
              : "Keine Blueprints verfügbar."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {blueprints.map((bp) => (
            <Card
              key={bp._id}
              className={bp.status === "claimed" ? "opacity-60" : ""}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{bp.name}</CardTitle>
                    <CardDescription className="flex items-center gap-1 mt-0.5">
                      <MemoryStick className="h-3.5 w-3.5" />
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
                    {bp.status === "available" ? t("projects.blueprints.available") : t("projects.blueprints.claimed")}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                {canInitialize && bp.status === "available" && (
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => setInitTarget(bp)}
                  >
                    <Zap className="mr-1.5 h-3.5 w-3.5" />
                    {t("projects.servers.initialize")}
                  </Button>
                )}
                {isAdmin && bp.status === "available" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                    onClick={() => setDeleteTarget(bp)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Blueprint Dialog */}
      <CreateBlueprintDialog
        projectKey={projectKey}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {/* Initialize Blueprint (Server Wizard) */}
      {initTarget && (
        <CreateServerWizard
          projectKey={projectKey}
          open={!!initTarget}
          onOpenChange={(o) => { if (!o) setInitTarget(null); }}
          blueprintId={initTarget._id}
          maxRam={initTarget.maxRam}
        />
      )}

      {/* Delete Confirmation */}
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
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? t("projects.servers.deleting") : t("projects.servers.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
