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
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
} from "lucide-react";
import type { AdminUserResponse, AdminRoleResponse, PermissionEntry } from "@/lib/api/types";

interface AdminUsersPanelProps {
  initialUsers: AdminUserResponse[];
  roles: AdminRoleResponse[];
}

export function AdminUsersPanel({ initialUsers, roles }: AdminUsersPanelProps) {
  const [users, setUsers] = useState(initialUsers);
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
        err instanceof Error ? err.message : "Failed to create user",
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
        err instanceof Error ? err.message : "Failed to update user",
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
      toast.error(err instanceof Error ? err.message : "Failed");
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
      toast.error(err instanceof Error ? err.message : "Failed");
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
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {t("admin.users.title")}
          </h1>
          <p className="text-zinc-500">{t("admin.users.subtitle")}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("admin.users.createUser")}
        </Button>
      </div>

      {/* Users list */}
      <div className="space-y-2">
        {users.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center py-12 text-center">
              <Users className="mb-3 h-10 w-10 text-zinc-300" />
              <p className="text-zinc-500">{t("admin.users.noUsers")}</p>
            </CardContent>
          </Card>
        )}
        {users.map((user) => (
          <Card key={user._id}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                <Users className="h-5 w-5" />
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
                  <p className="text-xs text-zinc-400">
                    {t("admin.users.roles")}: {user.roles.join(", ")}
                  </p>
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
                  className="text-red-500 hover:text-red-700"
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
                placeholder="username"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.users.email")}</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="user@example.com"
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
