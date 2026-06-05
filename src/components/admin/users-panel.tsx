"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/ui/status-badge";
import { CopyableField } from "@/components/ui/copyable-field";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { PermissionListEditor } from "./permission-list-editor";
import {
  createUserAction,
  updateUserAction,
  deleteUserAction,
  enableUserAction,
  disableUserAction,
  resetUserPasswordAction,
} from "@/app/(app)/actions/admin";
import { useLocale } from "@/context/locale-context";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  Users,
  Search,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { AdminUserResponse, AdminRoleResponse, PermissionEntry } from "@/lib/api/types";

/** First two initials from a username, e.g. "john.doe" -> "JD". */
function initialsOf(name: string): string {
  const parts = name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return name.slice(0, 2).toUpperCase();
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

interface AdminUsersPanelProps {
  initialUsers: AdminUserResponse[];
  roles: AdminRoleResponse[];
}

export function AdminUsersPanel({ initialUsers, roles }: AdminUsersPanelProps) {
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUserResponse | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AdminUserResponse | null>(null);
  const [tempPasswordResult, setTempPasswordResult] = useState<{
    tempPassword: string;
    emailSent: boolean;
    username: string;
  } | null>(null);
  const { t } = useLocale();

  // Create form state
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEnabled, setNewEnabled] = useState(true);
  const [newRoles, setNewRoles] = useState<string[]>([]);
  const [newPermissions, setNewPermissions] = useState<PermissionEntry[]>([]);
  const [createLoading, setCreateLoading] = useState(false);

  // Edit form state
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editPermissions, setEditPermissions] = useState<PermissionEntry[]>([]);
  const [editLoading, setEditLoading] = useState(false);

  const resetCreateForm = () => {
    setNewUsername("");
    setNewEmail("");
    setNewPassword("");
    setNewEnabled(true);
    setNewRoles([]);
    setNewPermissions([]);
  };

  const handleCreate = async () => {
    if (!newUsername) return;
    setCreateLoading(true);
    try {
      const result = await createUserAction({
        username: newUsername,
        email: newEmail || undefined,
        password: newPassword || undefined,
        enabled: newEnabled,
        roles: newRoles,
        permissions: newPermissions,
      });
      setUsers((prev) => [result.user, ...prev]);

      if (result.tempPassword) {
        setTempPasswordResult({
          tempPassword: result.tempPassword,
          emailSent: result.emailSent || false,
          username: newUsername,
        });
      }

      toast.success(t("admin.users.userCreated", { name: newUsername }));
      setCreateOpen(false);
      resetCreateForm();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("admin.users.createFailed"),
      );
    } finally {
      setCreateLoading(false);
    }
  };

  const openEdit = (user: AdminUserResponse) => {
    setEditUser(user);
    setEditUsername(user.username);
    setEditEmail(user.email);
    setEditRoles(user.roles);
    setEditPermissions(user.permissions);
  };

  const handleUpdate = async () => {
    if (!editUser) return;
    setEditLoading(true);
    try {
      const updated = await updateUserAction(editUser._id, {
        username: editUsername,
        email: editEmail,
        roles: editRoles,
        permissions: editPermissions,
      });
      setUsers((prev) =>
        prev.map((u) => (u._id === editUser._id ? updated : u)),
      );
      toast.success(t("admin.users.userUpdated"));
      setEditUser(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("admin.users.updateFailed"),
      );
    } finally {
      setEditLoading(false);
    }
  };

  const handleToggle = async (user: AdminUserResponse) => {
    try {
      if (user.enabled) {
        await disableUserAction(user._id);
      } else {
        await enableUserAction(user._id);
      }
      setUsers((prev) =>
        prev.map((u) =>
          u._id === user._id ? { ...u, enabled: !u.enabled } : u,
        ),
      );
      toast.success(
        user.enabled
          ? t("admin.users.userDisabled", { name: user.username })
          : t("admin.users.userEnabled", { name: user.username }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.users.failed"));
    }
  };

  const handleResetPassword = async (user: AdminUserResponse) => {
    try {
      const result = await resetUserPasswordAction(user._id);
      setTempPasswordResult({
        tempPassword: result.tempPassword,
        emailSent: result.emailSent,
        username: user.username,
      });
      toast.success(t("admin.users.passwordReset"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.users.failed"));
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteUserAction(deleteConfirm._id);
      setUsers((prev) => prev.filter((u) => u._id !== deleteConfirm._id));
      toast.success(t("admin.users.userDeleted", { name: deleteConfirm.username }));
      setDeleteConfirm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.users.failed"));
    }
  };

  const filteredUsers = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.roles.some((r) => r.toLowerCase().includes(q)),
    );
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {t("admin.users.title")}
          </h1>
          <p className="text-zinc-500">{t("admin.users.subtitle")}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="shadow-z1">
          <Plus className="mr-2 h-4 w-4" />
          {t("admin.users.createUser")}
        </Button>
      </div>

      {/* Search */}
      {users.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("admin.users.searchPlaceholder")}
            className="pl-9"
          />
        </div>
      )}

      {/* Users list */}
      <div className="space-y-2">
        {users.length === 0 && (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title={t("admin.users.noUsers")}
          />
        )}
        {users.length > 0 && filteredUsers.length === 0 && (
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title={t("admin.users.noUsers")}
            className="py-10"
          />
        )}
        {filteredUsers.map((user) => (
          <Card key={user._id} interactive className="animate-fade-in">
            <CardContent className="flex items-center gap-4 p-4">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-2 transition-colors",
                  user.enabled
                    ? "bg-brand-muted text-brand ring-brand/40"
                    : "bg-zinc-100 text-zinc-500 ring-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700",
                )}
              >
                {initialsOf(user.username)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{user.username}</p>
                  <StatusBadge variant={user.enabled ? "enabled" : "disabled"}>
                    {user.enabled ? t("admin.users.active") : t("admin.users.disabled")}
                  </StatusBadge>
                </div>
                <p className="text-sm text-zinc-500">{user.email}</p>
                {user.roles.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {user.roles.map((role) => (
                      <span
                        key={role}
                        className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Switch
                  checked={user.enabled}
                  onCheckedChange={() => handleToggle(user)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleResetPassword(user)}
                  title={t("admin.users.resetPassword")}
                >
                  <KeyRound className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEdit(user)}
                  title={t("common.edit")}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteConfirm(user)}
                  title={t("common.delete")}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("admin.users.createUser")}</DialogTitle>
            <DialogDescription>{t("admin.users.createUserDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("admin.users.username")}</Label>
              <Input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder={t("admin.users.usernamePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.users.email")}</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder={t("admin.users.emailPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.users.password")}</Label>
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("admin.users.passwordPlaceholder")}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={newEnabled}
                onCheckedChange={setNewEnabled}
              />
              <Label>{t("admin.users.enabled")}</Label>
            </div>
            <div className="space-y-2">
              <Label>{t("admin.users.roles")}</Label>
              <div className="space-y-2">
                {roles.map((role) => (
                  <div key={role._id} className="flex items-center gap-2">
                    <Checkbox
                      checked={newRoles.includes(role.name)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setNewRoles([...newRoles, role.name]);
                        } else {
                          setNewRoles(newRoles.filter((r) => r !== role.name));
                        }
                      }}
                    />
                    <Label className="font-normal">{role.name}</Label>
                  </div>
                ))}
              </div>
            </div>
            <PermissionListEditor
              permissions={newPermissions}
              onChange={setNewPermissions}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false);
                resetCreateForm();
              }}
            >
              {t("admin.users.cancel")}
            </Button>
            <Button onClick={handleCreate} disabled={createLoading}>
              {createLoading ? t("admin.users.creating") : t("admin.users.createUser")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("admin.users.editUser")}</DialogTitle>
            <DialogDescription>{t("admin.users.editUserDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("admin.users.username")}</Label>
              <Input
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.users.email")}</Label>
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.users.roles")}</Label>
              <div className="space-y-2">
                {roles.map((role) => (
                  <div key={role._id} className="flex items-center gap-2">
                    <Checkbox
                      checked={editRoles.includes(role.name)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setEditRoles([...editRoles, role.name]);
                        } else {
                          setEditRoles(
                            editRoles.filter((r) => r !== role.name),
                          );
                        }
                      }}
                    />
                    <Label className="font-normal">{role.name}</Label>
                  </div>
                ))}
              </div>
            </div>
            <PermissionListEditor
              permissions={editPermissions}
              onChange={setEditPermissions}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>
              {t("admin.users.cancel")}
            </Button>
            <Button onClick={handleUpdate} disabled={editLoading}>
              {editLoading ? t("admin.users.saving") : t("admin.users.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.users.deleteUser")}</DialogTitle>
            <DialogDescription>
              {t("admin.users.deleteUserDesc", { name: deleteConfirm?.username ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              {t("admin.users.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t("admin.users.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Temp Password Dialog */}
      <Dialog
        open={!!tempPasswordResult}
        onOpenChange={() => setTempPasswordResult(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.users.tempPassword")}</DialogTitle>
            <DialogDescription>
              {tempPasswordResult?.emailSent
                ? t("admin.users.tempPasswordEmailSent")
                : t("admin.users.tempPasswordManual", { username: tempPasswordResult?.username ?? "" })}
            </DialogDescription>
          </DialogHeader>
          {tempPasswordResult && (
            <CopyableField
              label={t("admin.users.tempPassword")}
              value={tempPasswordResult.tempPassword}
            />
          )}
          <DialogFooter>
            <Button onClick={() => setTempPasswordResult(null)}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
