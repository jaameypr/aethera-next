"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const KNOWN_LABELS: Record<string, string> = {
  "server-port": "Server Port",
  "max-players": "Max. Spieler",
  "difficulty": "Schwierigkeit",
  "gamemode": "Spielmodus",
  "motd": "Server-Beschreibung (MOTD)",
  "white-list": "Whitelist aktiv",
};

interface PropertiesTabProps {
  serverId: string;
  projectKey: string;
  serverStatus: string;
}

export function PropertiesTab({ serverId, serverStatus }: PropertiesTabProps) {
  const [properties, setProperties] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = serverStatus !== "running";

  useEffect(() => {
    fetch(`/api/servers/${serverId}/properties`)
      .then((res) => {
        if (!res.ok) throw new Error("Fehler beim Laden");
        return res.json() as Promise<Record<string, string>>;
      })
      .then(setProperties)
      .catch(() => toast.error("Eigenschaften konnten nicht geladen werden"))
      .finally(() => setLoading(false));
  }, [serverId]);

  function handleChange(key: string, value: string) {
    setProperties((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/properties`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(properties),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Fehler beim Speichern");
      }
      toast.success("Eigenschaften gespeichert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Lade Eigenschaften…</p>;
  }

  const entries = Object.entries(properties).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-500">{entries.length} Eigenschaften</p>
          {!editable && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Server muss gestoppt sein um Eigenschaften zu bearbeiten
            </p>
          )}
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || !editable}
          size="sm"
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {saving ? "Speichere…" : "Speichern"}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
              <th className="w-64 px-3 py-2 text-left font-medium text-zinc-500">
                Eigenschaft
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
                <td className="px-3 py-1.5">
                  <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    {KNOWN_LABELS[key] ?? key}
                  </div>
                  {KNOWN_LABELS[key] && (
                    <div className="font-mono text-[10px] text-zinc-400">
                      {key}
                    </div>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <Input
                    value={value}
                    onChange={(e) => handleChange(key, e.target.value)}
                    disabled={!editable}
                    className="h-7 font-mono text-xs"
                  />
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td
                  colSpan={2}
                  className="px-3 py-6 text-center text-sm text-zinc-500"
                >
                  Keine Eigenschaften vorhanden
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
