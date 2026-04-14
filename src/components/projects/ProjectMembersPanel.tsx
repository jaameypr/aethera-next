"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  UserPlus, Crown, Shield, Wrench, Eye, ChevronDown,
  ChevronUp, Trash2, Server, Check, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { InviteMemberDialog } from "@/components/projects/InviteMemberDialog";
import {
  removeProjectMemberAction,
  updateProjectMemberRoleAction,
} from "@/app/(app)/actions/projects";
import {
  updateServerAccessAction,
  removeServerMemberAction,
} from "@/app/(app)/actions/servers";
import type { ProjectMemberRole } from "@/lib/services/project.service";
import { useLocale } from "@/context/locale-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServerPermEntry {
  serverId: string;
  serverName: string;
  permissions: string[];
}

interface Member {
  userId: string;
  username: string;
  role: ProjectMemberRole;
  serverAccess: ServerPermEntry[];
}

interface ProjectMembersPanelProps {
  projectKey: string;
  ownerUsername: string;
  members: Member[];
  isAdmin: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLE_META: Record<string, { label: string; icon: React.ElementType; color: string; badge: string }> = {
  admin:   { label: "Admin",   icon: Shield, color: "text-purple-600 dark:text-purple-400", badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  manager: { label: "Manager", icon: Wrench, color: "text-blue-600 dark:text-blue-400",     badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  viewer:  { label: "Viewer",  icon: Eye,    color: "text-zinc-500 dark:text-zinc-400",      badge: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
  member:  { label: "Manager", icon: Wrench, color: "text-blue-600 dark:text-blue-400",     badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
};

function Avatar({ name, role }: { name: string; role: string }) {
  const colors: Record<string, string> = {
    admin:   "bg-purple-200 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    manager: "bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    member:  "bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    viewer:  "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300",
  };
  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold uppercase ${colors[role] ?? colors.viewer}`}>
      {name[0]}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MemberRow
// ---------------------------------------------------------------------------

function MemberRow({
  member,
  projectKey,
  isAdmin,
  onRemoved,
  onRoleChanged,
}: {
  member: Member;
  projectKey: string;
  isAdmin: boolean;
  onRemoved: (userId: string) => void;
  onRoleChanged: (userId: string, role: ProjectMemberRole) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [serverAccess, setServerAccess] = useState(member.serverAccess);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [isPending, startTransition] = useTransition();
  const meta = ROLE_META[member.role] ?? ROLE_META.viewer;
  const Icon = meta.icon;
  const { t } = useLocale();

  const SERVER_PERM_OPTIONS = [
    { value: "server.start",    label: t("projects.members.permStart") },
    { value: "server.console",  label: t("projects.members.permConsole") },
    { value: "server.files",    label: t("projects.members.permFiles") },
    { value: "server.backups",  label: t("projects.members.permBackups") },
    { value: "server.settings", label: t("projects.members.permSettings") },
  ];

  function handleRoleChange(newRole: ProjectMemberRole) {
    startTransition(async () => {
      try {
        await updateProjectMemberRoleAction({ projectKey, userId: member.userId, role: newRole });
        onRoleChanged(member.userId, newRole);
        toast.success(t("projects.members.roleUpdated"));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("common.error"));
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      try {
        await removeProjectMemberAction({ projectKey, userId: member.userId });
        onRemoved(member.userId);
        toast.success(t("projects.members.memberRemoved", { name: member.username }));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("common.error"));
      } finally {
        setConfirmRemove(false);
      }
    });
  }

  function handleTogglePerm(serverId: string, perm: string) {
    const entry = serverAccess.find((s) => s.serverId === serverId);
    if (!entry) return;
    const has = entry.permissions.includes(perm);
    const newPerms = has ? entry.permissions.filter((p) => p !== perm) : [...entry.permissions, perm];

    startTransition(async () => {
      try {
        if (newPerms.length === 0) {
          await removeServerMemberAction({ serverId, userId: member.userId });
        } else {
          await updateServerAccessAction({ serverId, userId: member.userId, permissions: newPerms });
        }
        setServerAccess((prev) =>
          prev.map((s) => s.serverId === serverId ? { ...s, permissions: newPerms } : s),
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("common.error"));
      }
    });
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          {/* Main row */}
          <div className="flex items-center gap-3 px-4 py-3">
            <Avatar name={member.username} role={member.role} />

            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-sm">{member.username}</p>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge}`}>
                <Icon className="h-3 w-3" />
                {meta.label}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isAdmin && (
                <Select
                  value={member.role === "member" ? "manager" : member.role}
                  onValueChange={(v) => handleRoleChange(v as ProjectMemberRole)}
                  disabled={isPending}
                >
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{t("projects.members.roles.admin")}</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="viewer">{t("projects.members.roles.viewer")}</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {serverAccess.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              )}

              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-zinc-400 hover:text-red-500"
                  onClick={() => setConfirmRemove(true)}
                  disabled={isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Per-server permissions expanded */}
          {expanded && serverAccess.length > 0 && (
            <div className="border-t border-zinc-100 px-4 pb-3 pt-2 dark:border-zinc-800">
              <p className="mb-2 text-xs font-medium text-zinc-400 uppercase tracking-wide">
                {t("projects.members.serverPermissions")}
              </p>
              <div className="space-y-2">
                {serverAccess.map((srv) => (
                  <div key={srv.serverId}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Server className="h-3.5 w-3.5 text-zinc-400" />
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{srv.serverName}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-5">
                      {SERVER_PERM_OPTIONS.map((opt) => {
                        const active = srv.permissions.includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            disabled={isPending}
                            onClick={() => handleTogglePerm(srv.serverId, opt.value)}
                            className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                              active
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                            }`}
                          >
                            {active && <Check className="h-2.5 w-2.5" />}
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remove confirm dialog */}
      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("projects.members.removeConfirm")}</DialogTitle>
            <DialogDescription>
              {t("projects.members.removeConfirmDescFull", { name: member.username })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(false)} disabled={isPending}>
              {t("projects.members.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={isPending}>
              {isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {t("projects.members.remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export function ProjectMembersPanel({
  projectKey,
  ownerUsername,
  members: initialMembers,
  isAdmin,
}: ProjectMembersPanelProps) {
  const [members, setMembers] = useState(initialMembers);
  const [inviteOpen, setInviteOpen] = useState(false);
  const { t } = useLocale();

  function handleRemoved(userId: string) {
    setMembers((prev) => prev.filter((m) => m.userId !== userId));
  }

  function handleRoleChanged(userId: string, role: ProjectMemberRole) {
    setMembers((prev) =>
      prev.map((m) => m.userId === userId ? { ...m, role } : m),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("projects.members.title")}</h2>
        {isAdmin && (
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            {t("projects.members.invite")}
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {/* Owner */}
        <Card>
          <CardContent className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 text-sm font-bold uppercase dark:bg-amber-900/30 dark:text-amber-400">
              {ownerUsername[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium text-sm">{ownerUsername}</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <Crown className="h-3 w-3" />
                {t("projects.members.owner")}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Members */}
        {members.length === 0 && (
          <p className="py-4 text-center text-sm text-zinc-500">
            {isAdmin ? t("projects.members.noMembersInvite") : t("projects.members.noMembers")}
          </p>
        )}
        {members.map((m) => (
          <MemberRow
            key={m.userId}
            member={m}
            projectKey={projectKey}
            isAdmin={isAdmin}
            onRemoved={handleRemoved}
            onRoleChanged={handleRoleChanged}
          />
        ))}
      </div>

      <InviteMemberDialog
        projectKey={projectKey}
        open={inviteOpen}
        onOpenChange={(o) => {
          setInviteOpen(o);
        }}
      />
    </div>
  );
}
