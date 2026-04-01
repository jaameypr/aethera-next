"use client";

import { useState } from "react";
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

const schema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(64, "Maximal 64 Zeichen"),
  key: z
    .string()
    .min(1, "Key ist erforderlich")
    .max(32, "Maximal 32 Zeichen")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Nur Kleinbuchstaben, Zahlen und Bindestriche",
    ),
});

type FormValues = z.infer<typeof schema>;

export function CreateProjectDialog({ canCreate = true }: { canCreate?: boolean } = {}) {
  if (!canCreate) return null;

  const [open, setOpen] = useState(false);

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
      toast.success("Projekt erstellt");
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Erstellen");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1.5 h-4 w-4" />
          Neues Projekt
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Projekt erstellen</DialogTitle>
            <DialogDescription>
              Erstelle ein neues Projekt um deine Server zu organisieren.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                placeholder="Mein Projekt"
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
              <Label htmlFor="project-key">Key</Label>
              <Input
                id="project-key"
                placeholder="mein-projekt"
                className="font-mono"
                {...register("key")}
              />
              {errors.key && (
                <p className="text-sm text-red-500">{errors.key.message}</p>
              )}
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Wird in URLs und API-Aufrufen verwendet. Kann nicht geändert werden.
              </p>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Erstelle…" : "Erstellen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
