"use client";

import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Check, X } from "lucide-react";
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
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", key: "" },
  });

  const keyValue = watch("key");
  // Mirror the schema's key constraints for a live, read-only validity hint.
  const keyValid =
    keyValue.length > 0 &&
    keyValue.length <= 32 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(keyValue);

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

  // Hooks must run unconditionally; gate rendering after they are declared.
  if (!canCreate) return null;

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
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-key">{t("projects.create.key")}</Label>
              <div className="relative">
                <Input
                  id="project-key"
                  placeholder={t("projects.create.keyPlaceholder")}
                  className="font-mono pr-9"
                  {...register("key")}
                />
                {keyValue.length > 0 && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 animate-fade-in">
                    {keyValid ? (
                      <Check className="h-4 w-4 text-brand" />
                    ) : (
                      <X className="h-4 w-4 text-destructive" />
                    )}
                  </span>
                )}
              </div>
              {errors.key && (
                <p className="text-sm text-destructive">{errors.key.message}</p>
              )}
              {keyValid && (
                <p className="animate-fade-in text-xs text-muted-foreground">
                  {t("projects.create.keyHint")}{" "}
                  <span className="font-mono text-foreground/70">/projects/{keyValue}</span>
                </p>
              )}
              {!keyValid && (
                <p className="text-xs text-muted-foreground">
                  {t("projects.create.keyHint")}
                </p>
              )}
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
