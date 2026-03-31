"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Terminal, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
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
  grantServerAccessAction,
  removeServerMemberAction,
  updateServerAccessAction,
} from "@/app/(app)/actions/servers";
import { searchUsersAction } from "@/app/(app)/actions/projects";

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

  // Console invite state
  const [consoleQuery, setConsoleQuery] = useState("");
  const [consoleResults, setConsoleResults] = useState<{ _id: string; username: string }[]>([]);
  const [consoleSearching, setConsoleSearching] = useState(false);
  const [consoleSelected, setConsoleSelected] = useState<{ _id: string; username: string } | null>(null);
  const [showConsoleDropdown, setShowConsoleDropdown] = useState(false);
  const [consoleDebounce, setConsoleDebounce] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setEntries(access);
  }, [access]);

  function handleConsoleQueryChange(value: string) {
    setConsoleQuery(value);
    setConsoleSelected(null);
    setShowConsoleDropdown(true);
    if (consoleDebounce) clearTimeout(consoleDebounce);
    if (!value.trim()) { setConsoleResults([]); return; }
    setConsoleSearching(true);
    setConsoleDebounce(setTimeout(async () => {
      try {
        const res = await searchUsersAction({ q: value });
        setConsoleResults(res);
      } finally {
        setConsoleSearching(false);
      }
    }, 300));
  }

  function handleConsoleInvite() {
    if (!consoleSelected) return;
    const existing = entries.find((e) => e.userId === consoleSelected._id);
    startTransition(async () => {
      try {
        if (existing) {
          if (!existing.permissions.includes("server.console")) {
            const newPerms = [...existing.permissions, "server.console"];
            await updateServerAccessAction({ serverId, userId: consoleSelected._id, permissions: newPerms });
            setEntries((prev) => prev.map((e) => e.userId === consoleSelected._id ? { ...e, permissions: newPerms } : e));
          }
        } else {
          await grantServerAccessAction({ serverId, userId: consoleSelected._id, permissions: ["server.console"] });
          setEntries((prev) => [...prev, { userId: consoleSelected._id, permissions: ["server.console"] }]);
        }
        toast.success(`${consoleSelected.username} hat Konsolen-Zugriff`);
        setConsoleQuery("");
        setConsoleSelected(null);
        setConsoleResults([]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler");
      }
    });
  }

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
        await updateServerAccessAction({ serverId, userId, permissions: newPermissions });
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
      {/* Quick Console Invite */}
      <Card className="border-blue-200 dark:border-blue-900">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-blue-700 dark:text-blue-400">
            <Terminal className="h-4 w-4" />
            Konsolen-Zugriff einladen
          </CardTitle>
          <CardDescription>
            Benutzer erhält ausschließlich Konsolen-Zugriff auf diesen Server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                className="pl-9"
                placeholder="Benutzername suchen…"
                value={consoleQuery}
                onChange={(e) => handleConsoleQueryChange(e.target.value)}
                onFocus={() => consoleQuery && setShowConsoleDropdown(true)}
                autoComplete="off"
              />
              {consoleSearching && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-400" />
              )}
              {showConsoleDropdown && consoleResults.length > 0 && (
                <div className="absolute z-10 w-full rounded-md border border-zinc-200 bg-white shadow-md dark:border-zinc-700 dark:bg-zinc-900">
                  {consoleResults.map((u) => (
                    <button
                      key={u._id}
                      type="button"
                      onClick={() => { setConsoleSelected(u); setConsoleQuery(u.username); setShowConsoleDropdown(false); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold uppercase dark:bg-zinc-700">
                        {u.username[0]}
                      </div>
                      {u.username}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button
              onClick={handleConsoleInvite}
              disabled={!consoleSelected || isPending}
              size="sm"
            >
              <Terminal className="mr-1.5 h-4 w-4" />
              Einladen
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Add member (granular) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Granularer Zugriff</CardTitle>
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
                          onClick={() => handleTogglePermission(entry.userId, opt.value)}
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

