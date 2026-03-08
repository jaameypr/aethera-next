"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Save, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const MOD_LOADERS = [
  "vanilla",
  "forge",
  "fabric",
  "paper",
  "spigot",
  "purpur",
] as const;
type ModLoader = (typeof MOD_LOADERS)[number];

const settingsSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(64, "Maximal 64 Zeichen"),
  memory: z
    .number()
    .min(512, "Mindestens 512 MB")
    .max(65536, "Maximal 65536 MB"),
  port: z.number().min(1024, "Mindestens 1024").max(65535, "Maximal 65535"),
  version: z.string().optional(),
  modLoader: z.enum(MOD_LOADERS),
  javaArgs: z.string().optional(),
  autoStart: z.boolean(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

export interface ServerPlain {
  _id: string;
  name: string;
  status: string;
  port: number;
  memory: number;
  version?: string;
  modLoader?: string;
  javaArgs?: string;
  autoStart: boolean;
}

interface SettingsTabProps {
  server: ServerPlain;
  projectKey: string;
}

export function SettingsTab({ server, projectKey }: SettingsTabProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const editable = server.status === "stopped";

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: server.name,
      memory: server.memory,
      port: server.port,
      version: server.version ?? "",
      modLoader: (MOD_LOADERS.includes(server.modLoader as ModLoader)
        ? server.modLoader
        : "vanilla") as ModLoader,
      javaArgs: server.javaArgs ?? "",
      autoStart: server.autoStart,
    },
  });

  async function onSave(data: SettingsForm) {
    setSaving(true);
    try {
      const res = await fetch(`/api/servers/${server._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          memory: data.memory,
          port: data.port,
          version: data.version || undefined,
          modLoader: data.modLoader,
          javaArgs: data.javaArgs || undefined,
          autoStart: data.autoStart,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Fehler beim Speichern");
      }
      toast.success("Einstellungen gespeichert");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleteConfirm !== server.name) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/servers/${server._id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Fehler beim Löschen");
      }
      toast.success("Server gelöscht");
      router.push(`/projects/${projectKey}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Löschen");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Hinweis wenn nicht editierbar */}
      {!editable && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400">
          Server muss gestoppt sein um Einstellungen zu bearbeiten.
        </div>
      )}

      {/* Einstellungen */}
      <Card>
        <form onSubmit={handleSubmit(onSave)}>
          <CardHeader>
            <CardTitle className="text-base">Server-Konfiguration</CardTitle>
          </CardHeader>

          <CardContent className="grid gap-4 sm:grid-cols-2">
            {/* Name */}
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="s-name">Name</Label>
              <Input id="s-name" disabled={!editable} {...register("name")} />
              {errors.name && (
                <p className="text-xs text-red-500">{errors.name.message}</p>
              )}
            </div>

            {/* RAM */}
            <div className="space-y-1">
              <Label htmlFor="s-memory">RAM (MB)</Label>
              <Input
                id="s-memory"
                type="number"
                disabled={!editable}
                {...register("memory", { valueAsNumber: true })}
              />
              {errors.memory && (
                <p className="text-xs text-red-500">{errors.memory.message}</p>
              )}
            </div>

            {/* Port */}
            <div className="space-y-1">
              <Label htmlFor="s-port">Port</Label>
              <Input
                id="s-port"
                type="number"
                disabled={!editable}
                {...register("port", { valueAsNumber: true })}
              />
              {errors.port && (
                <p className="text-xs text-red-500">{errors.port.message}</p>
              )}
            </div>

            {/* Version */}
            <div className="space-y-1">
              <Label htmlFor="s-version">Version</Label>
              <Input
                id="s-version"
                placeholder="latest"
                disabled={!editable}
                {...register("version")}
              />
            </div>

            {/* ModLoader */}
            <div className="space-y-1">
              <Label>Mod-Loader</Label>
              <Controller
                name="modLoader"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={!editable}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MOD_LOADERS.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l.charAt(0).toUpperCase() + l.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Java Args */}
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="s-javaArgs">Java Argumente</Label>
              <Input
                id="s-javaArgs"
                placeholder="-XX:+UseG1GC"
                className="font-mono"
                disabled={!editable}
                {...register("javaArgs")}
              />
            </div>

            {/* Auto-Start */}
            <div className="flex items-center gap-3 sm:col-span-2">
              <Controller
                name="autoStart"
                control={control}
                render={({ field }) => (
                  <Switch
                    id="s-autoStart"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={!editable}
                  />
                )}
              />
              <Label htmlFor="s-autoStart">Automatisch starten</Label>
            </div>
          </CardContent>

          <CardFooter>
            <Button type="submit" disabled={saving || !editable}>
              <Save className="mr-1.5 h-4 w-4" />
              {saving ? "Speichere…" : "Speichern"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Gefahrenzone */}
      <Card className="border-red-200 dark:border-red-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            Gefahrenzone
          </CardTitle>
          <CardDescription>
            Löscht den Server, Container und alle zugehörigen Daten
            unwiderruflich.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Dialog
            open={deleteOpen}
            onOpenChange={(open) => {
              setDeleteOpen(open);
              if (!open) setDeleteConfirm("");
            }}
          >
            <DialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="mr-1.5 h-4 w-4" />
                Server löschen
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Server löschen</DialogTitle>
                <DialogDescription>
                  Gib <strong>{server.name}</strong> ein um den Server
                  unwiderruflich zu löschen.
                </DialogDescription>
              </DialogHeader>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={server.name}
                autoFocus
              />
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteOpen(false)}
                  disabled={deleting}
                >
                  Abbrechen
                </Button>
                <Button
                  variant="destructive"
                  disabled={deleting || deleteConfirm !== server.name}
                  onClick={handleDelete}
                >
                  {deleting ? "Lösche…" : "Endgültig löschen"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardFooter>
      </Card>
    </div>
  );
}
