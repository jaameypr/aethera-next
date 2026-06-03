"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Upload, Trash2, ToggleLeft, ToggleRight, Loader2, Package, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
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
      toast.error(t("servers.addons.loadFailed", { label }));
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
              reject(new Error(JSON.parse(xhr.responseText).error ?? t("servers.addons.uploadFailed")));
            } catch {
              reject(new Error(t("servers.addons.uploadFailed")));
            }
          }
        };
        xhr.onerror = () => reject(new Error(t("servers.addons.uploadFailed")));
        xhr.send(formData);
      });

      toast.success(t("servers.addons.uploaded", { name: file.name }));
      fetchItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("servers.addons.uploadFailed"));
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
        toast.success(t("servers.addons.deleted"));
        fetchItems();
      } catch {
        toast.error(t("servers.addons.deleteFailed"));
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
        toast.success(enabled ? t("servers.addons.enabled") : t("servers.addons.disabled"));
        fetchItems();
      } catch {
        toast.error(t("servers.addons.toggleFailed"));
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
              {isUploading ? `${uploadProgress}%` : t("servers.addons.uploading")}
            </span>
          </Button>
        </label>
      </CardHeader>
      {isUploading && (
        <div className="mx-6 mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand transition-all duration-200 ease-out"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <span className="sr-only">{t("servers.addons.loading")}</span>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-1">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Package className="h-6 w-6" />}
            title={t("servers.addons.empty", { label })}
            className="px-4 py-8"
          />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li
                key={item.filename}
                className="-mx-2 flex items-center justify-between rounded-md px-2 py-2 transition-colors hover:bg-accent/60"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  {item.enabled ? (
                    <PackageOpen className="h-4 w-4 shrink-0 text-brand" />
                  ) : (
                    <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-sm font-medium transition-colors",
                        !item.enabled && "text-muted-foreground line-through",
                      )}
                    >
                      {item.filename}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatSize(item.size)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {supportsToggle && (
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isPending}
                      onClick={() => handleToggle(item.filename, !item.enabled)}
                      title={item.enabled ? t("servers.addons.disableTitle") : t("servers.addons.enableTitle")}
                    >
                      {item.enabled ? (
                        <ToggleRight className="h-4 w-4 text-brand transition-transform active:scale-90" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-muted-foreground transition-transform active:scale-90" />
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    onClick={() => handleDelete(item.filename)}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground transition-colors hover:text-destructive" />
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
  const { t } = useLocale();
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
          {t("servers.addons.modsPluginsUnavailable", { modLoader: modLoader ?? "Vanilla" })}
        </p>
      )}
    </div>
  );
}

