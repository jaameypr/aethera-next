"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Upload, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
  const [items, setItems] = useState<AddonEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

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
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/servers/${serverId}/${type}`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) throw new Error((await res.json()).error);
        toast.success(`${file.name} hochgeladen`);
        fetchItems();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload fehlgeschlagen");
      }
    });
    e.target.value = "";
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">{label}</CardTitle>
        <label>
          <input type="file" className="hidden" onChange={handleUpload} />
          <Button variant="outline" size="sm" asChild disabled={isPending}>
            <span>
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Hochladen
            </span>
          </Button>
        </label>
      </CardHeader>
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
                      title={item.enabled ? "Deaktivieren" : "Aktivieren"}
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

export function ServerAddonsTab({ serverId }: { serverId: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AddonSection
        serverId={serverId}
        type="mods"
        label="Mods"
        supportsToggle={true}
      />
      <AddonSection
        serverId={serverId}
        type="plugins"
        label="Plugins"
        supportsToggle={false}
      />
      <AddonSection
        serverId={serverId}
        type="datapacks"
        label="Datapacks"
        supportsToggle={true}
      />
    </div>
  );
}
