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
import { JAVA_VERSIONS } from "@/lib/utils/java-version";
import { useLocale } from "@/context/locale-context";
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
  name: z.string().min(1, "Name is required").max(64, "Max 64 characters"),
  memory: z
    .number()
    .min(512, "Min 512 MB")
    .max(65536, "Max 65536 MB"),
  port: z.number().min(1024, "Min 1024").max(65535, "Max 65535"),
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
  serverType?: string;
  javaArgs?: string;
  javaVersion?: string;
  autoStart: boolean;
}

interface SettingsTabProps {
  server: ServerPlain;
  projectKey: string;
}

export function SettingsTab({ server, projectKey }: SettingsTabProps) {
  const router = useRouter();
  const { t } = useLocale();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [javaVersion, setJavaVersion] = useState(server.javaVersion ?? "21");

  const editable = server.status === "stopped" || server.status === "error";

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
        : MOD_LOADERS.includes(server.serverType as ModLoader)
          ? server.serverType
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
          javaVersion,
          tag: `java${javaVersion}`,
          autoStart: data.autoStart,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? t("servers.settings.saveFailed"));
      }
      toast.success(t("servers.settings.saved"));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("servers.settings.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleteConfirm.trim() !== server.name.trim()) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/servers/${server._id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? t("servers.settings.deleteFailed"));
      }
      toast.success(t("servers.settings.deleted"));
      router.push(`/projects/${projectKey}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("servers.settings.deleteFailed"));
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Hinweis wenn nicht editierbar */}
      {!editable && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400">
          {t("servers.settings.mustBeStopped")}
        </div>
      )}
      {server.status === "error" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
          {t("servers.settings.inErrorState")}
        </div>
      )}

      {/* Einstellungen */}
      <Card>
        <form onSubmit={handleSubmit(onSave)}>
          <CardHeader>
            <CardTitle className="text-base">{t("servers.settings.cardTitle")}</CardTitle>
          </CardHeader>

          <CardContent className="grid gap-4 sm:grid-cols-2">
            {/* Name */}
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="s-name">{t("servers.settings.name")}</Label>
              <Input id="s-name" disabled={!editable} {...register("name")} />
              {errors.name && (
                <p className="text-xs text-red-500">{errors.name.message}</p>
              )}
            </div>

            {/* RAM */}
            <div className="space-y-1">
              <Label htmlFor="s-memory">{t("servers.settings.ram")}</Label>
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
              <Label htmlFor="s-port">{t("servers.settings.port")}</Label>
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
              <Label htmlFor="s-version">{t("servers.settings.version")}</Label>
              <Input
                id="s-version"
                placeholder="latest"
                disabled={!editable}
                {...register("version")}
              />
            </div>

            {/* Java-Version */}
            <div className="space-y-1">
              <Label>{t("servers.settings.javaVersion")}</Label>
              <Select value={javaVersion} onValueChange={setJavaVersion} disabled={!editable}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JAVA_VERSIONS.map((v) => (
                    <SelectItem key={v} value={v}>
                      Java {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ModLoader */}
            <div className="space-y-1">
              <Label>{t("servers.settings.modLoader")}</Label>
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
              <Label htmlFor="s-javaArgs">{t("servers.settings.javaArgs")}</Label>
              <Input
                id="s-javaArgs"
                placeholder={t("servers.settings.javaArgsPlaceholder")}
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
              <Label htmlFor="s-autoStart">{t("servers.settings.autoStart")}</Label>
            </div>
          </CardContent>

          <CardFooter>
            <Button type="submit" disabled={saving || !editable}>
              <Save className="mr-1.5 h-4 w-4" />
              {saving ? t("servers.settings.saving") : t("servers.settings.save")}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Gefahrenzone */}
      <Card className="border-red-200 dark:border-red-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            {t("servers.settings.dangerZone")}
          </CardTitle>
          <CardDescription>
            {t("servers.settings.dangerZoneDesc")}
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
                {t("servers.settings.deleteServer")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("servers.settings.deleteTitle")}</DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-2 text-sm text-zinc-500 dark:text-zinc-400">
                    <p>{t("servers.settings.deleteDesc")}</p>
                    <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900">
                      <span className="flex-1 font-mono text-xs text-zinc-700 dark:text-zinc-300">{server.name}</span>
                      <button
                        type="button"
                        className="shrink-0 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                        onClick={() => { navigator.clipboard.writeText(server.name); setDeleteConfirm(server.name); }}
                      >
                        {t("servers.settings.copyPaste")}
                      </button>
                    </div>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <div className="relative">
                <Input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder={server.name}
                  autoFocus
                  className={deleteConfirm.trim() === server.name.trim() && deleteConfirm.length > 0 ? "border-red-500 pr-8" : ""}
                />
                {deleteConfirm.trim() === server.name.trim() && deleteConfirm.length > 0 && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-red-500 text-xs font-medium">✓</span>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteOpen(false)}
                  disabled={deleting}
                >
                  {t("servers.settings.cancel")}
                </Button>
                <Button
                  variant="destructive"
                  disabled={deleting || deleteConfirm.trim() !== server.name.trim() || deleteConfirm.length === 0}
                  onClick={handleDelete}
                >
                  {deleting ? t("servers.settings.deleting") : t("servers.settings.deleteFinal")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardFooter>
      </Card>
    </div>
  );
}
