"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/context/locale-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  Play,
  Square,
  ExternalLink,
  Save,
  Loader2,
  Heart,
  Trash2,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import type { InstalledModuleResponse, ModuleManifestEnvDef } from "@/lib/api/types";
import {
  startModuleAction,
  stopModuleAction,
  updateModuleConfigAction,
  updateModulePublicUrlAction,
  checkModuleHealthAction,
  uninstallModuleAction,
  reinstallModuleAction,
} from "@/app/(app)/actions/modules";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ModuleDetailPanelProps {
  module: InstalledModuleResponse;
}

export function ModuleDetailPanel({ module: initial }: ModuleDetailPanelProps) {
  const router = useRouter();
  const { t, locale } = useLocale();
  const [mod, setMod] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [publicUrl, setPublicUrl] = useState(initial.publicUrl ?? "");
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [showReinstallConfirm, setShowReinstallConfirm] = useState(false);
  const [showUninstallConfirm, setShowUninstallConfirm] = useState(false);
  // Two-stage destructive confirm: require an explicit arm before firing.
  const [uninstallArmed, setUninstallArmed] = useState(false);

  // Parse configurable env defs from manifest
  const configurableDefs: ModuleManifestEnvDef[] =
    mod.manifest?.env?.configurable ?? [];

  const handleStart = async () => {
    setLoading(true);
    try {
      const result = await startModuleAction(mod.moduleId);
      setMod(result);
      toast.success(t("admin.moduleDetail.started"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const result = await stopModuleAction(mod.moduleId);
      setMod(result);
      toast.success(t("admin.moduleDetail.stopped"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    if (Object.keys(configValues).length === 0) return;
    setLoading(true);
    try {
      // For secret fields, skip empty values (clearing the input shouldn't wipe the secret)
      const secretKeys = new Set(configurableDefs.filter((d) => d.secret).map((d) => d.key));
      const payload = Object.fromEntries(
        Object.entries(configValues).filter(([k, v]) => !(secretKeys.has(k) && v === "")),
      );
      if (Object.keys(payload).length === 0) {
        toast.info(t("admin.moduleDetail.noChanges"));
        setLoading(false);
        return;
      }
      const result = await updateModuleConfigAction(mod.moduleId, payload);
      setMod(result);
      setConfigValues({});
      toast.success(t("admin.moduleDetail.configSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleSavePublicUrl = async () => {
    setLoading(true);
    try {
      const result = await updateModulePublicUrlAction(mod.moduleId, publicUrl.trim() || undefined);
      setMod(result);
      toast.success(t("admin.moduleDetail.publicUrlSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleHealthCheck = async () => {
    try {
      const result = await checkModuleHealthAction(mod.moduleId);
      setHealthStatus(result.healthy ? t("admin.moduleDetail.healthy") : `✗ ${result.status}`);
    } catch {
      setHealthStatus(t("admin.moduleDetail.healthError"));
    }
  };

  const handleUninstall = async () => {
    setShowUninstallConfirm(false);
    setUninstallArmed(false);
    setLoading(true);
    try {
      await uninstallModuleAction(mod.moduleId);
      toast.success(t("admin.moduleDetail.uninstalled"));
      router.push("/admin/modules");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
      setLoading(false);
    }
  };

  const handleReinstall = async () => {
    setShowReinstallConfirm(false);
    setLoading(true);
    try {
      const result = await reinstallModuleAction(mod.moduleId);
      setMod(result);
      toast.success(t("admin.moduleDetail.reinstalled"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const statusVariant =
    mod.status === "running"
      ? ("running" as const)
      : mod.status === "stopped" || mod.status === "error"
        ? ("stopped" as const)
        : ("default" as const);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t("admin.moduleDetail.back")}
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {mod.name}
          </h1>
          <p className="text-sm text-zinc-500">
            v{mod.version} · {mod.type} · ID: {mod.moduleId}
          </p>
        </div>
        <StatusBadge variant={statusVariant}>{mod.status}</StatusBadge>
      </div>

      {/* Error message */}
      {mod.errorMessage && (
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="py-3 text-sm text-red-600 dark:text-red-400">
            {mod.errorMessage}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card className="relative overflow-hidden">
        {/* Action progress overlay */}
        {loading && (
          <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden">
            <div className="h-full w-1/3 animate-shimmer rounded-full bg-gradient-to-r from-transparent via-brand to-transparent bg-[length:200%_100%]" />
          </div>
        )}
        <CardHeader>
          <CardTitle className="text-base">{t("admin.moduleDetail.actions")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {mod.status === "stopped" && (
            <Button onClick={handleStart} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-1 h-4 w-4" />
              )}
              {t("admin.moduleDetail.start")}
            </Button>
          )}
          {mod.status === "running" && (
            <>
              <Button variant="outline" onClick={handleStop} disabled={loading}>
                <Square className="mr-1 h-4 w-4" />
                {t("admin.moduleDetail.stop")}
              </Button>
              {mod.exposure === "public" && (
                <Button variant="outline" asChild>
                  <a
                    href={`/api/modules/${mod.moduleId}/launch`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-1 h-4 w-4" />
                    {t("admin.moduleDetail.open")}
                  </a>
                </Button>
              )}
            </>
          )}
          <Button variant="outline" onClick={handleHealthCheck}>
            <Heart className="mr-1 h-4 w-4" />
            {t("admin.moduleDetail.healthCheck")}
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const res = await fetch(`/api/modules/${mod.moduleId}/provision-key`, { method: "POST" });
                if (!res.ok) throw new Error((await res.json()).error);
                toast.success(t("admin.moduleDetail.apiKeyProvisioned"));
              } catch (err) {
                toast.error(err instanceof Error ? err.message : t("common.error"));
              }
            }}
          >
            🔑 {t("admin.moduleDetail.apiKey")}
          </Button>
          {healthStatus && (
            <span className="flex items-center text-sm text-zinc-500">
              {healthStatus}
            </span>
          )}
          <div className="flex-1" />
          {["running", "stopped", "error"].includes(mod.status) && mod.type === "docker" && (
            <Button
              variant="outline"
              onClick={() => setShowReinstallConfirm(true)}
              disabled={loading}
            >
              <RotateCcw className="mr-1 h-4 w-4" />
              {t("admin.moduleDetail.reinstall")}
            </Button>
          )}
          <Button
            variant="destructive"
            onClick={() => {
              setUninstallArmed(false);
              setShowUninstallConfirm(true);
            }}
            disabled={loading}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            {t("admin.moduleDetail.uninstall")}
          </Button>
        </CardContent>
      </Card>

      {/* Uninstall confirmation dialog — two-stage destructive confirm */}
      <Dialog
        open={showUninstallConfirm}
        onOpenChange={(open) => {
          setShowUninstallConfirm(open);
          if (!open) setUninstallArmed(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.moduleDetail.uninstall")}</DialogTitle>
            <DialogDescription>
              {t("admin.modules.confirmUninstallDesc", { name: mod.name })}
            </DialogDescription>
          </DialogHeader>
          {uninstallArmed && (
            <div className="flex animate-shake items-start gap-2 rounded-md border border-destructive/40 bg-destructive-muted px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t("admin.modules.permanentRemove")}</span>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowUninstallConfirm(false);
                setUninstallArmed(false);
              }}
            >
              {t("admin.moduleDetail.cancel")}
            </Button>
            {!uninstallArmed ? (
              <Button
                variant="destructive"
                onClick={() => setUninstallArmed(true)}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                {t("admin.moduleDetail.uninstall")}
              </Button>
            ) : (
              <Button
                variant="destructive"
                className="animate-glow"
                onClick={handleUninstall}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-1 h-4 w-4" />
                )}
                {t("admin.moduleDetail.uninstall")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reinstall confirmation dialog */}
      <Dialog open={showReinstallConfirm} onOpenChange={setShowReinstallConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.moduleDetail.reinstallTitle")}</DialogTitle>
            <DialogDescription>
              {t("admin.moduleDetail.reinstallDesc", { name: mod.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReinstallConfirm(false)}>
              {t("admin.moduleDetail.cancel")}
            </Button>
            <Button onClick={handleReinstall} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-1 h-4 w-4" />
              )}
              {t("admin.moduleDetail.reinstall")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.moduleDetail.details")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-zinc-500">{t("admin.moduleDetail.detailType")}</dt>
            <dd>{mod.type}</dd>
            <dt className="text-zinc-500">{t("admin.moduleDetail.detailVersion")}</dt>
            <dd>{mod.version}</dd>
            {mod.internalUrl && (
              <>
                <dt className="text-zinc-500">{t("admin.moduleDetail.detailInternalUrl")}</dt>
                <dd className="truncate font-mono text-xs">
                  {mod.internalUrl}
                </dd>
              </>
            )}
            {mod.assignedPort && (
              <>
                <dt className="text-zinc-500">{t("admin.moduleDetail.detailPort")}</dt>
                <dd>{mod.assignedPort}</dd>
              </>
            )}
            <dt className="text-zinc-500">{t("admin.moduleDetail.detailInstalled")}</dt>
            <dd>{new Date(mod.createdAt).toLocaleString(locale)}</dd>
            <dt className="text-zinc-500">{t("admin.moduleDetail.detailUpdated")}</dt>
            <dd>{new Date(mod.updatedAt).toLocaleString(locale)}</dd>
          </dl>
        </CardContent>
      </Card>

      {/* Public URL (only for public modules) */}
      {mod.exposure === "public" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.moduleDetail.publicUrl")}</CardTitle>
            <CardDescription>
              {t("admin.moduleDetail.publicUrlDesc", { port: mod.assignedPort ?? "" })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder={t("admin.moduleDetail.publicUrlPlaceholder", { port: String(mod.assignedPort ?? "") })}
              value={publicUrl}
              onChange={(e) => setPublicUrl(e.target.value)}
            />
            <Button
              onClick={handleSavePublicUrl}
              disabled={loading}
              size="sm"
            >
              {loading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              {t("admin.moduleDetail.save")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Permissions */}
      {mod.permissions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.moduleDetail.permissions")}</CardTitle>
            <CardDescription>
              {t("admin.moduleDetail.permissionsDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {mod.permissions.map((perm) => (
                <span
                  key={perm}
                  className="rounded bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {perm}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration */}
      {configurableDefs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.moduleDetail.configuration")}</CardTitle>
            <CardDescription>
              {t("admin.moduleDetail.configurationDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {configurableDefs.map((def) => {
                const isSecretSet = mod.savedConfig?.[def.key] === "__SECRET_SET__";
                const savedValue = !def.secret ? (mod.savedConfig?.[def.key] ?? "") : "";
                const displayValue = configValues[def.key] ?? savedValue;
                const placeholder = def.secret
                  ? (isSecretSet ? `•••••••• ${t("admin.moduleDetail.secretSaved")}` : (def.default || ""))
                  : (def.default || "");
                return (
                  <div key={def.key} className="space-y-1">
                    <Label htmlFor={def.key}>{def.label || def.key}</Label>
                    {def.description && (
                      <p className="text-xs text-zinc-500">{def.description}</p>
                    )}
                    <Input
                      id={def.key}
                      type={def.secret ? "password" : "text"}
                      placeholder={placeholder}
                      value={displayValue}
                      onChange={(e) =>
                        setConfigValues((prev) => ({
                          ...prev,
                          [def.key]: e.target.value,
                        }))
                      }
                    />
                  </div>
                );
              })}
            <Button
              onClick={handleSaveConfig}
              disabled={
                loading || Object.keys(configValues).length === 0
              }
            >
              {loading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              {t("admin.moduleDetail.save")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
