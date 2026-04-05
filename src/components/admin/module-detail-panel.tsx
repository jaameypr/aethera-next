"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import type { InstalledModuleResponse, ModuleManifestEnvDef } from "@/lib/api/types";
import {
  startModuleAction,
  stopModuleAction,
  updateModuleConfigAction,
  updateModulePublicUrlAction,
  checkModuleHealthAction,
  uninstallModuleAction,
} from "@/app/(app)/actions/modules";

interface ModuleDetailPanelProps {
  module: InstalledModuleResponse;
}

export function ModuleDetailPanel({ module: initial }: ModuleDetailPanelProps) {
  const router = useRouter();
  const [mod, setMod] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [publicUrl, setPublicUrl] = useState(initial.publicUrl ?? "");
  const [healthStatus, setHealthStatus] = useState<string | null>(null);

  // Parse configurable env defs from manifest
  const configurableDefs: ModuleManifestEnvDef[] =
    mod.manifest?.env?.configurable ?? [];

  const handleStart = async () => {
    setLoading(true);
    try {
      const result = await startModuleAction(mod.moduleId);
      setMod(result);
      toast.success("Modul gestartet");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const result = await stopModuleAction(mod.moduleId);
      setMod(result);
      toast.success("Modul gestoppt");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    if (Object.keys(configValues).length === 0) return;
    setLoading(true);
    try {
      const result = await updateModuleConfigAction(
        mod.moduleId,
        configValues,
      );
      setMod(result);
      setConfigValues({});
      toast.success("Konfiguration gespeichert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  };

  const handleSavePublicUrl = async () => {
    setLoading(true);
    try {
      const result = await updateModulePublicUrlAction(mod.moduleId, publicUrl.trim() || undefined);
      setMod(result);
      toast.success("Öffentliche URL gespeichert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  };

  const handleHealthCheck = async () => {
    try {
      const result = await checkModuleHealthAction(mod.moduleId);
      setHealthStatus(result.healthy ? "✓ Healthy" : `✗ ${result.status}`);
    } catch {
      setHealthStatus("✗ Error");
    }
  };

  const handleUninstall = async () => {
    setLoading(true);
    try {
      await uninstallModuleAction(mod.moduleId);
      toast.success("Modul deinstalliert");
      router.push("/admin/modules");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
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
          Zurück
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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aktionen</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {mod.status === "stopped" && (
            <Button onClick={handleStart} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-1 h-4 w-4" />
              )}
              Starten
            </Button>
          )}
          {mod.status === "running" && (
            <>
              <Button variant="outline" onClick={handleStop} disabled={loading}>
                <Square className="mr-1 h-4 w-4" />
                Stoppen
              </Button>
              {mod.exposure === "public" && (
                <Button variant="outline" asChild>
                  <a
                    href={`/api/modules/${mod.moduleId}/launch`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-1 h-4 w-4" />
                    Öffnen
                  </a>
                </Button>
              )}
            </>
          )}
          <Button variant="outline" onClick={handleHealthCheck}>
            <Heart className="mr-1 h-4 w-4" />
            Health Check
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const res = await fetch(`/api/modules/${mod.moduleId}/provision-key`, { method: "POST" });
                if (!res.ok) throw new Error((await res.json()).error);
                toast.success("API Key provisioniert");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Fehler");
              }
            }}
          >
            🔑 API Key
          </Button>
          {healthStatus && (
            <span className="flex items-center text-sm text-zinc-500">
              {healthStatus}
            </span>
          )}
          <div className="flex-1" />
          <Button
            variant="destructive"
            onClick={handleUninstall}
            disabled={loading}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Deinstallieren
          </Button>
        </CardContent>
      </Card>

      {/* Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-zinc-500">Typ</dt>
            <dd>{mod.type}</dd>
            <dt className="text-zinc-500">Version</dt>
            <dd>{mod.version}</dd>
            {mod.internalUrl && (
              <>
                <dt className="text-zinc-500">Interne URL</dt>
                <dd className="truncate font-mono text-xs">
                  {mod.internalUrl}
                </dd>
              </>
            )}
            {mod.assignedPort && (
              <>
                <dt className="text-zinc-500">Port</dt>
                <dd>{mod.assignedPort}</dd>
              </>
            )}
            <dt className="text-zinc-500">Installiert</dt>
            <dd>{new Date(mod.createdAt).toLocaleString("de-DE")}</dd>
            <dt className="text-zinc-500">Aktualisiert</dt>
            <dd>{new Date(mod.updatedAt).toLocaleString("de-DE")}</dd>
          </dl>
        </CardContent>
      </Card>

      {/* Public URL (only for public modules) */}
      {mod.exposure === "public" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Öffentliche URL</CardTitle>
            <CardDescription>
              Externe URL unter der das Modul erreichbar ist. Leer lassen für
              automatische Erkennung (Host + Port {mod.assignedPort}).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder={`z.B. https://paperview.example.com oder http://1.2.3.4:${mod.assignedPort}`}
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
              Speichern
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Permissions */}
      {mod.permissions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Permissions</CardTitle>
            <CardDescription>
              Diese Permissions werden vom Modul registriert
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
            <CardTitle className="text-base">Konfiguration</CardTitle>
            <CardDescription>
              Modul-spezifische Umgebungsvariablen. Änderungen erfordern einen
              Neustart des Moduls.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {configurableDefs.map((def) => (
              <div key={def.key} className="space-y-1">
                <Label htmlFor={def.key}>{def.label || def.key}</Label>
                <Input
                  id={def.key}
                  type={def.secret ? "password" : "text"}
                  placeholder={def.default || ""}
                  value={configValues[def.key] ?? ""}
                  onChange={(e) =>
                    setConfigValues((prev) => ({
                      ...prev,
                      [def.key]: e.target.value,
                    }))
                  }
                />
              </div>
            ))}
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
              Speichern
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
