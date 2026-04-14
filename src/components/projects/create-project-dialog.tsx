"use client";

import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProjectAction } from "@/app/(app)/actions/projects";
import { useLocale } from "@/context/locale-context";

type FormValues = { name: string; key: string };

export function CreateProjectDialog({ canCreate = true }: { canCreate?: boolean } = {}) {
  if (!canCreate) return null;

  const [open, setOpen] = useState(false);
  const { t } = useLocale();

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .min(1, t("projects.validation.nameRequired"))
          .max(64, t("projects.validation.nameMaxLength")),
        key: z
          .string()
          .min(1, t("projects.validation.keyRequired"))
          .max(32, t("projects.validation.keyMaxLength"))
          .regex(
            /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
            t("projects.validation.keyFormat"),
          ),
      }),
    [t],
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", key: "" },
  });

  function slugify(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function onSubmit(data: FormValues) {
    try {
      await createProjectAction({ key: data.key, name: data.name });
      toast.success(t("projects.create.title"));
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1.5 h-4 w-4" />
          {t("projects.create.trigger")}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{t("projects.create.title")}</DialogTitle>
            <DialogDescription>
              {t("projects.create.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">{t("projects.create.name")}</Label>
              <Input
                id="project-name"
                placeholder={t("projects.create.namePlaceholder")}
                {...register("name", {
                  onChange: (e) => {
                    const slug = slugify(e.target.value);
                    setValue("key", slug, { shouldValidate: true });
                  },
                })}
              />
              {errors.name && (
                <p className="text-sm text-red-500">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-key">{t("projects.create.key")}</Label>
              <Input
                id="project-key"
                placeholder={t("projects.create.keyPlaceholder")}
                className="font-mono"
                {...register("key")}
              />
              {errors.key && (
                <p className="text-sm text-red-500">{errors.key.message}</p>
              )}
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {t("projects.create.keyHint")}
              </p>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {t("projects.create.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("projects.create.creating") : t("projects.create.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
