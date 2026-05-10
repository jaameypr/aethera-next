"use client";

import { useState, useEffect, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Save } from "lucide-react";
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
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  readPropertiesAction,
  writePropertiesAction,
} from "@/app/(app)/actions/servers";
import { useLocale } from "@/context/locale-context";

const configSchema = z.object({
  motd: z.string().max(59, "Max 59 characters"),
  "max-players": z.number().min(1, "Min 1").max(1000, "Max 1000"),
  difficulty: z.enum(["peaceful", "easy", "normal", "hard"]),
  "white-list": z.boolean(),
  pvp: z.boolean(),
  "spawn-protection": z.number().min(0).max(100),
  "enable-command-blocks": z.boolean(),
  "online-mode": z.boolean(),
  hardcore: z.boolean(),
  "level-seed": z.string(),
});

type ConfigForm = z.infer<typeof configSchema>;

interface ConfigurationTabProps {
  serverId: string;
  serverStatus: string;
}

export function ConfigurationTab({ serverId, serverStatus }: ConfigurationTabProps) {
  const { t } = useLocale();
  const [rawProperties, setRawProperties] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const editable = serverStatus === "stopped" || serverStatus === "error";

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ConfigForm>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      motd: "A Minecraft Server",
      "max-players": 20,
      difficulty: "normal",
      "white-list": false,
      pvp: true,
      "spawn-protection": 16,
      "enable-command-blocks": false,
      "online-mode": true,
      hardcore: false,
      "level-seed": "",
    },
  });

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setRawProperties({});

    readPropertiesAction({ serverId })
      .then((props) => {
        if (cancelled) return;
        setRawProperties(props);
        reset({
          motd: props["motd"] ?? "A Minecraft Server",
          "max-players": parseInt(props["max-players"] ?? "20", 10) || 20,
          difficulty: (["peaceful", "easy", "normal", "hard"].includes(props["difficulty"])
            ? props["difficulty"]
            : "normal") as ConfigForm["difficulty"],
          "white-list": props["white-list"] === "true",
          pvp: props["pvp"] !== "false",
          "spawn-protection": parseInt(props["spawn-protection"] ?? "16", 10) || 0,
          "enable-command-blocks": props["enable-command-blocks"] === "true",
          "online-mode": props["online-mode"] !== "false",
          hardcore: props["hardcore"] === "true",
          "level-seed": props["level-seed"] ?? "",
        });
      })
      .catch(() => {
        if (!cancelled) toast.error(t("servers.configuration.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [serverId, reset]);

  function onSave(data: ConfigForm) {
    startTransition(async () => {
      try {
        const merged: Record<string, string> = {
          ...rawProperties,
          motd: data.motd,
          "max-players": String(data["max-players"]),
          difficulty: data.difficulty,
          "white-list": String(data["white-list"]),
          pvp: String(data.pvp),
          "spawn-protection": String(data["spawn-protection"]),
          "enable-command-blocks": String(data["enable-command-blocks"]),
          "online-mode": String(data["online-mode"]),
          hardcore: String(data.hardcore),
        };
        if (data["level-seed"]) merged["level-seed"] = data["level-seed"];

        await writePropertiesAction({ serverId, properties: merged });
        setRawProperties(merged);
        toast.success(t("servers.configuration.saved"));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("servers.configuration.saveFailed"));
      }
    });
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">{t("servers.configuration.loading")}</p>;
  }

  return (
    <div className="space-y-6">
      {!editable && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400">
          {t("servers.configuration.mustBeStopped")}
        </div>
      )}

      <Card>
        <form onSubmit={handleSubmit(onSave)}>
          <CardHeader>
            <CardTitle className="text-base">{t("servers.configuration.cardTitle")}</CardTitle>
          </CardHeader>

          <CardContent className="grid gap-4 sm:grid-cols-2">
            {/* MOTD */}
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="cfg-motd">{t("servers.configuration.motd")}</Label>
              <Input
                id="cfg-motd"
                placeholder={t("servers.configuration.motdPlaceholder")}
                disabled={!editable}
                {...register("motd")}
              />
              {errors.motd && (
                <p className="text-xs text-red-500">{errors.motd.message}</p>
              )}
            </div>

            {/* Max Players */}
            <div className="space-y-1">
              <Label htmlFor="cfg-maxplayers">{t("servers.configuration.maxPlayers")}</Label>
              <Input
                id="cfg-maxplayers"
                type="number"
                min={1}
                max={1000}
                disabled={!editable}
                {...register("max-players", { valueAsNumber: true })}
              />
              {errors["max-players"] && (
                <p className="text-xs text-red-500">{errors["max-players"].message}</p>
              )}
            </div>

            {/* Difficulty */}
            <div className="space-y-1">
              <Label>{t("servers.configuration.difficulty")}</Label>
              <Controller
                name="difficulty"
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
                      <SelectItem value="peaceful">{t("servers.configuration.diffPeaceful")}</SelectItem>
                      <SelectItem value="easy">{t("servers.configuration.diffEasy")}</SelectItem>
                      <SelectItem value="normal">{t("servers.configuration.diffNormal")}</SelectItem>
                      <SelectItem value="hard">{t("servers.configuration.diffHard")}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Spawn Protection */}
            <div className="space-y-1">
              <Label htmlFor="cfg-spawn">{t("servers.configuration.spawnProtection")}</Label>
              <Input
                id="cfg-spawn"
                type="number"
                min={0}
                max={100}
                disabled={!editable}
                {...register("spawn-protection", { valueAsNumber: true })}
              />
            </div>

            {/* Level Seed */}
            <div className="space-y-1">
              <Label htmlFor="cfg-seed">{t("servers.configuration.seed")}</Label>
              <Input
                id="cfg-seed"
                placeholder={t("servers.configuration.seedPlaceholder")}
                className="font-mono"
                disabled={!editable}
                {...register("level-seed")}
              />
            </div>

            {/* Toggles */}
            <div className="space-y-3 sm:col-span-2">
              {(
                [
                  { name: "white-list" as const, label: t("servers.configuration.whitelist") },
                  { name: "pvp" as const, label: t("servers.configuration.pvp") },
                  { name: "online-mode" as const, label: t("servers.configuration.onlineMode") },
                  { name: "enable-command-blocks" as const, label: t("servers.configuration.commandBlocks") },
                  { name: "hardcore" as const, label: t("servers.configuration.hardcore") },
                ]
              ).map(({ name, label }) => (
                <div key={name} className="flex items-center gap-3">
                  <Controller
                    name={name}
                    control={control}
                    render={({ field }) => (
                      <Switch
                        id={`cfg-${name}`}
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!editable}
                      />
                    )}
                  />
                  <Label htmlFor={`cfg-${name}`}>{label}</Label>
                </div>
              ))}
            </div>
          </CardContent>

          <CardFooter>
            <Button type="submit" disabled={isPending || !editable}>
              <Save className="mr-1.5 h-4 w-4" />
              {isPending ? t("servers.configuration.saving") : t("servers.configuration.save")}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
