"use client";

import { useState, useEffect, useTransition } from "react";
import { useLocale } from "@/context/locale-context";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Search, Shield, Check, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  grantServerAccessAction,
  removeServerMemberAction,
  updateServerAccessAction,
} from "@/app/(app)/actions/servers";
import { searchUsersAction } from "@/app/(app)/actions/projects";

interface AccessEntry {
  userId: string;
  username: string;
  permissions: string[];
}

interface ServerAccessTabProps {
  serverId: string;
  access: AccessEntry[];
}

export function ServerAccessTab({ serverId, access }: ServerAccessTabProps) {
  const { t } = useLocale();

  const PERMISSION_OPTIONS = [
    { value: "server.start",    label: t("servers.access.permStart") },
    { value: "server.stop",     label: t("servers.access.permStop") },
    { value: "server.console",  label: t("servers.access.permConsole") },
    { value: "server.files",    label: t("servers.access.permFiles") },
    { value: "server.backups",  label: t("servers.access.permBackups") },
    { value: "server.settings", label: t("servers.access.permSettings") },
  ];

  const [entries, setEntries] = useState<AccessEntry[]>(access);
  const [isPending, startTransition] = useTransition();

  // User search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ _id: string; username: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<{ _id: string; username: string } | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [debounce, setDebounce] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Selected permissions for new invite
  const [selectedPerms, setSelectedPerms] = useState<string[]>(["server.console"]);

  useEffect(() => {
    setEntries(access);
  }, [access]);

  function handleQueryChange(value: string) {
    setQuery(value);
    setSelected(null);
    setShowDropdown(true);
    if (debounce) clearTimeout(debounce);
    if (!value.trim()) { setResults([]); return; }
    setSearching(true);
    setDebounce(setTimeout(async () => {
      try {
        const res = await searchUsersAction({ q: value });
        setResults(res);
      } finally {
        setSearching(false);
      }
    }, 300));
  }

  function toggleNewPerm(perm: string) {
    setSelectedPerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  }

  function handleInvite() {
    if (!selected || selectedPerms.length === 0) return;
    const existing = entries.find((e) => e.userId === selected._id);
    startTransition(async () => {
      try {
        if (existing) {
          const merged = [...new Set([...existing.permissions, ...selectedPerms])];
          await updateServerAccessAction({ serverId, userId: selected._id, permissions: merged });
          setEntries((prev) =>
            prev.map((e) => e.userId === selected._id ? { ...e, permissions: merged } : e),
          );
        } else {
          await grantServerAccessAction({ serverId, userId: selected._id, permissions: selectedPerms });
          setEntries((prev) => [...prev, { userId: selected._id, username: selected.username, permissions: selectedPerms }]);
        }
        toast.success(t("servers.access.accessGranted", { username: selected.username }));
        setQuery("");
        setSelected(null);
        setResults([]);
        setSelectedPerms(["server.console"]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("common.error"));
      }
    });
  }

  function handleRemove(userId: string) {
    startTransition(async () => {
      try {
        await removeServerMemberAction({ serverId, userId });
        setEntries((prev) => prev.filter((e) => e.userId !== userId));
        toast.success(t("servers.access.accessRemoved"));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("common.error"));
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
        toast.error(err instanceof Error ? err.message : t("common.error"));
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Invite with configurable permissions */}
      <Card className="border-info/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-info">
            <Shield className="h-4 w-4" />
            {t("servers.access.cardTitle")}
          </CardTitle>
          <CardDescription>
            {t("servers.access.cardDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* User search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              className="pl-9"
              placeholder={t("servers.access.searchPlaceholder")}
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onFocus={() => query && setShowDropdown(true)}
              autoComplete="off"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-400" />
            )}
            {showDropdown && results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-zinc-200 bg-white shadow-md dark:border-zinc-700 dark:bg-zinc-900">
                {results.map((u) => (
                  <button
                    key={u._id}
                    type="button"
                    onClick={() => { setSelected(u); setQuery(u.username); setShowDropdown(false); }}
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

          {/* Permission toggles */}
          <div>
            <p className="mb-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">{t("servers.access.permissionsLabel")}</p>
            <div className="flex flex-wrap gap-2">
              {PERMISSION_OPTIONS.map((opt) => {
                const active = selectedPerms.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleNewPerm(opt.value)}
                    aria-pressed={active}
                    className={cn(
                      "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-95",
                      active
                        ? "bg-info-muted text-info"
                        : "bg-secondary text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {active && <Check className="h-3 w-3 animate-fade-in" />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            onClick={handleInvite}
            disabled={!selected || selectedPerms.length === 0 || isPending}
            size="sm"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t("servers.access.grantAccess")}
          </Button>
        </CardContent>
      </Card>

      {/* Members list */}
      {entries.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title={t("servers.access.noAccess")}
        />
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <Card key={entry.userId} interactive className="animate-fade-in">
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold uppercase dark:bg-zinc-700 dark:text-zinc-300">
                      {entry.username[0]}
                    </div>
                    <p className="font-medium text-sm">{entry.username}</p>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1 pl-9">
                    {PERMISSION_OPTIONS.map((opt) => {
                      const active = entry.permissions.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          disabled={isPending}
                          onClick={() => handleTogglePermission(entry.userId, opt.value)}
                          aria-pressed={active}
                          className={cn(
                            "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-95 disabled:opacity-60",
                            active
                              ? "bg-brand-muted text-brand"
                              : "bg-secondary text-muted-foreground hover:bg-accent",
                          )}
                        >
                          {active && <Check className="h-2.5 w-2.5 animate-fade-in" />}
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
                  <Trash2 className="h-4 w-4 text-muted-foreground transition-colors hover:text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

