"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
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
  grantServerAccessAction,
  removeServerMemberAction,
  updateServerAccessAction,
} from "@/app/(app)/actions/servers";

interface AccessEntry {
  userId: string;
  permissions: string[];
}

interface ServerAccessTabProps {
  serverId: string;
  access: AccessEntry[];
}

const PERMISSION_OPTIONS = [
  { value: "server.start", label: "Starten" },
  { value: "server.stop", label: "Stoppen" },
  { value: "server.console", label: "Konsole" },
  { value: "server.files", label: "Dateien" },
  { value: "server.backups", label: "Backups" },
  { value: "server.settings", label: "Einstellungen" },
];

export function ServerAccessTab({ serverId, access }: ServerAccessTabProps) {
  const [entries, setEntries] = useState<AccessEntry[]>(access);
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState("server.start");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setEntries(access);
  }, [access]);

  function handleGrant() {
    if (!newUserId.trim()) return;
    startTransition(async () => {
      try {
        await grantServerAccessAction({
          serverId,
          userId: newUserId.trim(),
          permissions: [newRole],
        });
        setEntries((prev) => [
          ...prev,
          { userId: newUserId.trim(), permissions: [newRole] },
        ]);
        setNewUserId("");
        toast.success("Zugriff gewährt");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler");
      }
    });
  }

  function handleRemove(userId: string) {
    startTransition(async () => {
      try {
        await removeServerMemberAction({ serverId, userId });
        setEntries((prev) => prev.filter((e) => e.userId !== userId));
        toast.success("Zugriff entfernt");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler");
      }
    });
  }

  function handleTogglePermission(userId: string, permission: string) {
    const entry = entries.find((e) => e.userId === userId);
    if (!entry) return;

    const has = entry.permissions.includes(permission);
    const newPermissions = has
      ? entry.permissions.filter((p) => p !== permission)
      : [...entry.permissions, permission];

    startTransition(async () => {
      try {
        await updateServerAccessAction({
          serverId,
          userId,
          permissions: newPermissions,
        });
        setEntries((prev) =>
          prev.map((e) =>
            e.userId === userId ? { ...e, permissions: newPermissions } : e,
          ),
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Add member */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zugriff hinzufügen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="access-user">User-ID</Label>
              <Input
                id="access-user"
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                placeholder="User-ID eingeben"
              />
            </div>
            <div className="w-40 space-y-1">
              <Label>Berechtigung</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERMISSION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleGrant} disabled={isPending}>
              <Plus className="mr-1.5 h-4 w-4" />
              Hinzufügen
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Members list */}
      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Keine zusätzlichen Berechtigungen vergeben
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <Card key={entry.userId}>
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <p className="font-mono text-sm">{entry.userId}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {PERMISSION_OPTIONS.map((opt) => {
                      const active = entry.permissions.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          disabled={isPending}
                          onClick={() =>
                            handleTogglePermission(entry.userId, opt.value)
                          }
                          className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                            active
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isPending}
                  onClick={() => handleRemove(entry.userId)}
                >
                  <Trash2 className="h-4 w-4 text-zinc-400 hover:text-red-500" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
