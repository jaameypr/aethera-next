"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Save, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  updateServerAction,
  deleteServerAction,
} from "@/app/(app)/actions/servers";

const settingsSchema = z.object({
  memory: z.number().min(512, "Mindestens 512 MB").max(32768),
  port: z.number().min(1024).max(65535),
  rconPort: z.number().min(1024).max(65535).optional(),
  version: z.string().optional(),
  javaArgs: z.string().optional(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

interface ServerSettingsTabProps {
  serverId: string;
  projectKey: string;
  serverName: string;
  defaults: {
    memory: number;
    port: number;
    rconPort?: number;
    version?: string;
    modLoader?: string;
    javaArgs?: string;
    javaVersion?: string;
  };
}

export function ServerSettingsTab({
  serverId,
  projectKey,
  serverName,
  defaults,
}: ServerSettingsTabProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [modLoader, setModLoader] = useState(defaults.modLoader ?? "vanilla");
  const [javaVersion, setJavaVersion] = useState(defaults.javaVersion ?? "21");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      memory: defaults.memory,
      port: defaults.port,
      rconPort: defaults.rconPort,
      version: defaults.version ?? "",
      javaArgs: defaults.javaArgs ?? "",
    },
  });

  function onSave(data: SettingsForm) {
    startTransition(async () => {
      try {
        await updateServerAction({
          serverId,
          patch: { ...data, modLoader, javaVersion },
        });
        toast.success("Einstellungen gespeichert");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
      }
    });
  }

  function handleDelete() {
    if (deleteConfirm !== serverName) return;
    startTransition(async () => {
      try {
        await deleteServerAction({ serverId });
        toast.success("Server gelöscht");
        router.push(`/projects/${projectKey}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler beim Löschen");
      }
    });
  }

  const loaders = ["vanilla", "forge", "fabric", "paper", "spigot", "purpur"];

  return (
    <div className="space-y-6">
      {/* Settings form */}
      <Card>
        <form onSubmit={handleSubmit(onSave)}>
          <CardHeader>
            <CardTitle className="text-base">Server-Konfiguration</CardTitle>
            <CardDescription>
              Server muss gestoppt sein um Änderungen zu übernehmen.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="memory">RAM (MB)</Label>
              <Input id="memory" type="number" {...register("memory", { valueAsNumber: true })} />
              {errors.memory && (
                <p className="text-xs text-red-500">{errors.memory.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="port">Port</Label>
              <Input id="port" type="number" {...register("port", { valueAsNumber: true })} />
              {errors.port && (
                <p className="text-xs text-red-500">{errors.port.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="rconPort">RCON Port</Label>
              <Input id="rconPort" type="number" {...register("rconPort", { valueAsNumber: true })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="version">Version</Label>
              <Input id="version" placeholder="latest" {...register("version")} />
            </div>
            <div className="space-y-1">
              <Label>Java-Version</Label>
              <Select value={javaVersion} onValueChange={setJavaVersion}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["8", "11", "17", "21"] as const).map((v) => (
                    <SelectItem key={v} value={v}>
                      Java {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Mod-Loader</Label>
              <Select value={modLoader} onValueChange={setModLoader}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {loaders.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l.charAt(0).toUpperCase() + l.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="javaArgs">Java Argumente</Label>
              <Input
                id="javaArgs"
                placeholder="-XX:+UseG1GC"
                className="font-mono"
                {...register("javaArgs")}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isPending}>
              <Save className="mr-1.5 h-4 w-4" />
              {isPending ? "Speichere…" : "Speichern"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Danger zone */}
      <Card className="border-red-200 dark:border-red-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            Gefahrenzone
          </CardTitle>
          <CardDescription>
            Gib den Servernamen &quot;{serverName}&quot; ein um den Server
            unwiderruflich zu löschen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={serverName}
          />
        </CardContent>
        <CardFooter>
          <Button
            variant="destructive"
            disabled={isPending || deleteConfirm !== serverName}
            onClick={handleDelete}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Server löschen
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
