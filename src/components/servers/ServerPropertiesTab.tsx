"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  readPropertiesAction,
  writePropertiesAction,
} from "@/app/(app)/actions/servers";

export function ServerPropertiesTab({ serverId }: { serverId: string }) {
  const [properties, setProperties] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    readPropertiesAction({ serverId })
      .then(setProperties)
      .catch(() => toast.error("Eigenschaften konnten nicht geladen werden"))
      .finally(() => setLoading(false));
  }, [serverId]);

  function handleChange(key: string, value: string) {
    setProperties((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await writePropertiesAction({ serverId, properties });
        toast.success("Eigenschaften gespeichert");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
      }
    });
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Lade Eigenschaften…</p>;
  }

  const entries = Object.entries(properties).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          {entries.length} Eigenschaften
        </p>
        <Button onClick={handleSave} disabled={isPending} size="sm">
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {isPending ? "Speichere…" : "Speichern"}
        </Button>
      </div>

      <div className="rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
              <th className="px-3 py-2 text-left font-medium text-zinc-500">
                Schlüssel
              </th>
              <th className="px-3 py-2 text-left font-medium text-zinc-500">
                Wert
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([key, value]) => (
              <tr
                key={key}
                className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
              >
                <td className="px-3 py-1.5 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                  {key}
                </td>
                <td className="px-3 py-1.5">
                  <Input
                    value={value}
                    onChange={(e) => handleChange(key, e.target.value)}
                    className="h-7 font-mono text-xs"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
