"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { deleteProjectAction } from "@/app/(app)/actions/projects";
import { useLocale } from "@/context/locale-context";

interface DeleteProjectSectionProps {
  projectKey: string;
  projectName: string;
  serverCount: number;
}

export function DeleteProjectSection({
  projectKey,
  projectName,
  serverCount,
}: DeleteProjectSectionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [isPending, startTransition] = useTransition();
  const { t } = useLocale();

  const canDelete = serverCount === 0;
  const confirmationMatch = confirmation === projectName;

  function handleDelete() {
    if (!confirmationMatch) return;
    startTransition(async () => {
      try {
        await deleteProjectAction({
          projectKey,
          confirmationName: confirmation,
        });
        toast.success(t("projects.delete.success"));
        router.push("/projects");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : t("projects.delete.error"),
        );
      }
    });
  }

  return (
    <div className="animate-fade-in rounded-lg border border-destructive/30 bg-destructive-muted/30 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-destructive-muted p-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-destructive">
            {t("projects.delete.sectionTitle")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {canDelete
              ? t("projects.delete.sectionDesc")
              : t("projects.delete.sectionDescBlocked", { count: serverCount })}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!canDelete}
          onClick={() => {
            setConfirmation("");
            setOpen(true);
          }}
          className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive-muted hover:text-destructive"
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          {t("projects.delete.deleteBtn")}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t("projects.delete.confirmTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("projects.delete.confirmDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-lg border border-destructive/30 bg-destructive-muted px-3 py-2">
              <p className="text-xs text-destructive">
                {t("projects.delete.confirmHint")}{" "}
                <span className="font-mono font-semibold">{projectName}</span>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-name">{t("projects.delete.confirmNameLabel")}</Label>
              <Input
                id="confirm-name"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder={projectName}
                autoComplete="off"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              {t("projects.delete.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!confirmationMatch || isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  {t("projects.delete.deleting")}
                </>
              ) : (
                <>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  {t("projects.delete.deleteConfirm")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
