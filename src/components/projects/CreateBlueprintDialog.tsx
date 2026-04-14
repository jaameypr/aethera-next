"use client";

import { useState, useTransition } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { createBlueprintAction } from "@/app/(app)/actions/servers";
import { useLocale } from "@/context/locale-context";

interface CreateBlueprintDialogProps {
  projectKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateBlueprintDialog({
  projectKey,
  open,
  onOpenChange,
}: CreateBlueprintDialogProps) {
  const [name, setName] = useState("");
  const [maxRam, setMaxRam] = useState(2048);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const { t } = useLocale();

  const schema = z.object({
    name: z.string().min(1, t("projects.blueprints.nameRequired")).max(48),
    maxRam: z.number().min(512, t("projects.blueprints.minRam")).max(65536),
  });

  function reset() {
    setName("");
    setMaxRam(2048);
    setErrors({});
  }

  function handleClose(open: boolean) {
    if (!open) reset();
    onOpenChange(open);
  }

  function handleSubmit() {
    const result = schema.safeParse({ name, maxRam });
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !errs[key]) errs[key] = issue.message;
      }
      setErrors(errs);
      return;
    }

    startTransition(async () => {
      try {
        await createBlueprintAction({ projectKey, name, maxRam });
        toast.success(t("projects.blueprints.blueprintCreated"));
        handleClose(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("common.error"));
      }
    });
  }

  const ramLabel = maxRam >= 1024 ? `${(maxRam / 1024).toFixed(1)} GB` : `${maxRam} MB`;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("projects.blueprints.createTitle")}</DialogTitle>
          <DialogDescription>
            {t("projects.blueprints.desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bp-name">{t("projects.servers.addServer")}</Label>
            <Input
              id="bp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("projects.blueprints.namePlaceholder")}
              autoFocus
            />
            {errors.name && (
              <p className="text-xs text-red-500">{errors.name}</p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t("projects.servers.maxRamLabel")}</Label>
              <span className="text-sm font-semibold">{ramLabel}</span>
            </div>
            <Slider
              value={[maxRam]}
              onValueChange={([v]) => setMaxRam(v)}
              min={512}
              max={32768}
              step={256}
            />
            <div className="flex justify-between text-xs text-zinc-500">
              <span>512 MB</span>
              <span>32 GB</span>
            </div>
            {errors.maxRam && (
              <p className="text-xs text-red-500">{errors.maxRam}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={isPending}>
            {t("projects.servers.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? t("common.creating") : t("projects.blueprints.createTitle")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
