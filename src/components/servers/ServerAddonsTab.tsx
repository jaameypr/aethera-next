"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Upload, Trash2, ToggleLeft, ToggleRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

interface AddonEntry {
  name: string;
  filename: string;
  size: number;
  modifiedAt: string;
  enabled: boolean;
}

type AddonType = "mods" | "plugins" | "datapacks";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AddonSection({
  serverId,
  type,
  label,
  supportsToggle,
}: {
  serverId: string;
  type: AddonType;
  label: string;
  supportsToggle: boolean;
}) {
  const { t } = useLocale();
  const [items, setItems] = useState<AddonEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  useEffect(() => {
    fetchItems();
  }, [serverId, type]);

  async function fetchItems() {
    try {
      const res = await fetch(`/api/servers/${serverId}/${type}`);
      if (!res.ok) throw new Error();
      setItems(await res.json());
    } catch {
      toast.error(`${label} konnten nicht geladen werden`);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploadProgress(0);
    try {
      await new Promise<void>((resolve, reject) => {
        const formData = new FormData();
        formData.append("file", file);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/servers/${serverId}/${type}`);

        xhr.upload.addEventListener("progress", (ev) => {
          if (ev.lengthComputable) {
            setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        });

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            try {
              reject(new Error(JSON.parse(xhr.responseText).error ?? "Upload fehlgeschlagen"));
            } catch {
              reject(new Error("Upload fehlgeschlagen"));
            }
          }
        };
        xhr.onerror = () => reject(new Error("Upload fehlgeschlagen"));
        xhr.send(formData);
      });

      toast.success(`${file.name} hochgeladen`);
      fetchItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setUploadProgress(null);
    }
  }

  async function handleDelete(filename: string) {
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/servers/${serverId}/${type}/${encodeURIComponent(filename)}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error();
        toast.success("Gelöscht");
        fetchItems();
      } catch {
        toast.error("Fehler beim Löschen");
      }
    });
  }

  async function handleToggle(filename: string, enabled: boolean) {
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/servers/${serverId}/${type}/${encodeURIComponent(filename)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled }),
          },
        );
        if (!res.ok) throw new Error();
        toast.success(enabled ? "Aktiviert" : "Deaktiviert");
        fetchItems();
      } catch {
        toast.error("Fehler beim Umschalten");
      }
    });
  }

  const isUploading = uploadProgress !== null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">{label}</CardTitle>
        <label>
          <input type="file" className="hidden" onChange={handleUpload} disabled={isUploading} />
          <Button variant="outline" size="sm" asChild disabled={isPending || isUploading}>
            <span>
              {isUploading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-3.5 w-3.5" />
              )}
              {isUploading ? `${uploadProgress}%` : "Hochladen"}
            </span>
          </Button>
        </label>
      </CardHeader>
      {isUploading && (
        <div className="mx-6 mb-3 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-200"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}
      <CardContent>
        {loading ? (
          <p className="text-sm text-zinc-500">Lade…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-zinc-500">Keine {label} installiert</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {items.map((item) => (
              <li
                key={item.filename}
                className="flex items-center justify-between py-2"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm font-medium",
                      !item.enabled && "text-zinc-400 line-through",
                    )}
                  >
                    {item.filename}
                  </p>
                  <p className="text-xs text-zinc-500">{formatSize(item.size)}</p>
                </div>
                <div className="flex items-center gap-1">
                  {supportsToggle && (
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isPending}
                      onClick={() => handleToggle(item.filename, !item.enabled)}
                      title={item.enabled ? t("servers.addons.disableTooltip") : t("servers.addons.enableTooltip")}
                    >
                      {item.enabled ? (
                        <ToggleRight className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-zinc-400" />
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    onClick={() => handleDelete(item.filename)}
                  >
                    <Trash2 className="h-4 w-4 text-zinc-400 hover:text-red-500" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export const MOD_LOADERS = ["forge", "fabric"] as const;
export const PLUGIN_LOADERS = ["paper", "spigot", "purpur"] as const;

export function ServerAddonsTab({
  serverId,
  modLoader,
}: {
  serverId: string;
  modLoader?: string;
}) {
  const supportsMods = MOD_LOADERS.includes(modLoader as (typeof MOD_LOADERS)[number]);
  const supportsPlugins = PLUGIN_LOADERS.includes(modLoader as (typeof PLUGIN_LOADERS)[number]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {supportsMods && (
        <AddonSection
          serverId={serverId}
          type="mods"
          label="Mods"
          supportsToggle={true}
        />
      )}
      {supportsPlugins && (
        <AddonSection
          serverId={serverId}
          type="plugins"
          label="Plugins"
          supportsToggle={false}
        />
      )}
      <AddonSection
        serverId={serverId}
        type="datapacks"
        label="Datapacks"
        supportsToggle={true}
      />
      {!supportsMods && !supportsPlugins && (
        <p className="col-span-full text-sm text-zinc-500">
          Mods und Plugins sind für{" "}
          <span className="font-medium capitalize">{modLoader ?? "Vanilla"}</span>-Server nicht
          verfügbar. Nur Datapacks werden unterstützt.
        </p>
      )}
    </div>
  );
}

