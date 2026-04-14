"use client";

import { useState, useTransition, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Search, Shield, Wrench, Eye, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  addProjectMemberAction,
  searchUsersAction,
} from "@/app/(app)/actions/projects";
import type { ProjectMemberRole } from "@/lib/services/project.service";
import { useLocale } from "@/context/locale-context";

interface UserResult {
  _id: string;
  username: string;
}

interface InviteMemberDialogProps {
  projectKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteMemberDialog({
  projectKey,
  open,
  onOpenChange,
}: InviteMemberDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [selected, setSelected] = useState<UserResult | null>(null);
  const [role, setRole] = useState<ProjectMemberRole>("manager");
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useLocale();

  const ROLES = useMemo(
    () => [
      {
        value: "admin" as ProjectMemberRole,
        label: "Admin",
        icon: Shield,
        color: "text-purple-600 dark:text-purple-400",
        bg: "bg-purple-50 dark:bg-purple-950/30",
        border: "border-purple-300 dark:border-purple-700",
        description: t("projects.invite.adminDesc"),
        perms: t("projects.invite.adminPerms").split("|"),
      },
      {
        value: "manager" as ProjectMemberRole,
        label: "Manager",
        icon: Wrench,
        color: "text-blue-600 dark:text-blue-400",
        bg: "bg-blue-50 dark:bg-blue-950/30",
        border: "border-blue-300 dark:border-blue-700",
        description: t("projects.invite.managerDesc"),
        perms: t("projects.invite.managerPerms").split("|"),
      },
      {
        value: "viewer" as ProjectMemberRole,
        label: "Viewer",
        icon: Eye,
        color: "text-zinc-600 dark:text-zinc-400",
        bg: "bg-zinc-50 dark:bg-zinc-900",
        border: "border-zinc-300 dark:border-zinc-700",
        description: t("projects.invite.viewerDesc"),
        perms: t("projects.invite.viewerPerms").split("|"),
      },
    ],
    [t],
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelected(null);
      setRole("manager");
      setShowDropdown(false);
    }
  }, [open]);

  function handleQueryChange(value: string) {
    setQuery(value);
    setSelected(null);
    setShowDropdown(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setResults([]); setSearching(false); return; }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchUsersAction({ q: value });
        setResults(res);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  function handleSelect(user: UserResult) {
    setSelected(user);
    setQuery(user.username);
    setShowDropdown(false);
  }

  function handleInvite() {
    if (!selected) return;
    startTransition(async () => {
      try {
        await addProjectMemberAction({ projectKey, userId: selected._id, role });
        toast.success(t("projects.invite.inviteSuccess", { name: selected.username }));
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("common.error"));
      }
    });
  }

  const selectedRole = ROLES.find((r) => r.value === role)!;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("projects.invite.title")}</DialogTitle>
          <DialogDescription>
            {t("projects.invite.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* User search */}
          <div className="space-y-1.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                className="pl-9"
                placeholder={t("projects.invite.searchPlaceholder")}
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onFocus={() => query && setShowDropdown(true)}
                autoComplete="off"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-400" />
              )}
            </div>

            {showDropdown && results.length > 0 && (
              <div className="rounded-md border border-zinc-200 bg-white shadow-md dark:border-zinc-700 dark:bg-zinc-900">
                {results.map((u) => (
                  <button
                    key={u._id}
                    type="button"
                    onClick={() => handleSelect(u)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold uppercase dark:bg-zinc-700">
                      {u.username[0]}
                    </div>
                    {u.username}
                  </button>
                ))}
              </div>
            )}

            {showDropdown && !searching && query && results.length === 0 && (
              <p className="text-xs text-zinc-400 px-1">{t("projects.invite.noUsersFound")}</p>
            )}
          </div>

          {/* Role cards */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t("projects.invite.roleLabel")}
            </p>
            <div className="space-y-2">
              {ROLES.map((r) => {
                const Icon = r.icon;
                const active = role === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    className={`w-full rounded-lg border-2 p-3 text-left transition-all ${
                      active ? `${r.bg} ${r.border}` : "border-transparent bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${active ? r.color : "text-zinc-400"}`} />
                        <span className={`text-sm font-semibold ${active ? r.color : "text-zinc-700 dark:text-zinc-300"}`}>
                          {r.label}
                        </span>
                        <span className="text-xs text-zinc-400">{r.description}</span>
                      </div>
                      {active && <Check className={`h-4 w-4 ${r.color}`} />}
                    </div>
                    {active && (
                      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                        {r.perms.map((p) => (
                          <li key={p} className={`text-xs ${r.color} opacity-80`}>
                            · {p}
                          </li>
                        ))}
                      </ul>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            className="w-full"
            onClick={handleInvite}
            disabled={!selected || isPending}
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <selectedRole.icon className="mr-2 h-4 w-4" />
            )}
            {selected
              ? t("projects.invite.inviteBtn", { name: selected.username, role: selectedRole.label })
              : t("projects.invite.selectUserBtn")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
